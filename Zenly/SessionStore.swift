import Foundation
import Observation

enum AppGroup {
    static let identifier = "group.com.andrewh.zenly"
    static let latestFrameFileName = "latest_frame.jpg"
    static let sessionActiveKey = "sessionActive"

    static var container: UserDefaults? { UserDefaults(suiteName: identifier) }
    static var fileContainer: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    static var latestFrameURL: URL? {
        fileContainer?.appendingPathComponent(latestFrameFileName)
    }
}

enum InterventionLevel: String, CaseIterable, Identifiable {
    case nudge  = "Nudge"
    case block  = "Block"
    case snitch = "Snitch"
    var id: String { rawValue }

    var label: String { rawValue.lowercased() }

    var blurb: String {
        switch self {
        case .nudge:  return "a gentle notification when you drift off task"
        case .block:  return "shields the distracting app so you can't open it"
        case .snitch: return "texts your accountability buddy when you slip 💀"
        }
    }
}

enum FocusMode: String {
    case task       // focused on a specific thing
    case guardian   // no task, just watching for self-destructive behavior
}

struct FocusSession: Equatable {
    var mode: FocusMode = .task
    var task: String            // empty in guardian mode
    var durationMinutes: Int?   // nil = indefinite
    var startedAt: Date

    var isGuardian: Bool { mode == .guardian }

    var endsAt: Date? {
        guard let d = durationMinutes else { return nil }
        return startedAt.addingTimeInterval(TimeInterval(d * 60))
    }

    var isActive: Bool {
        guard let end = endsAt else { return true }
        return Date() < end
    }
}

@MainActor
@Observable
final class SessionStore {
    var session: FocusSession?
    var onTask: Bool = true
    var nudgeCount: Int = 0
    var snitchCount: Int = 0
    var judgeStatusText: String = "screen judge idle"
    var lastJudgeReason: String = ""
    var lastJudgeAction: String = "none"

    @ObservationIgnored private let apiClient = ZenlyAPIClient()
    @ObservationIgnored private var judgeTask: Task<Void, Never>?
    @ObservationIgnored private var lastUploadedFrameModifiedAt: Date?
    @ObservationIgnored private static let judgeIntervalNanoseconds: UInt64 = 5_000_000_000

    // Persistent user settings (configured in the app before texting the agent).
    var userName: String {
        didSet { defaults?.set(userName, forKey: Keys.userName) }
    }
    var interventionLevel: InterventionLevel {
        didSet { defaults?.set(interventionLevel.rawValue, forKey: Keys.interventionLevel) }
    }
    var contactPhone: String {
        didSet { defaults?.set(contactPhone, forKey: Keys.contactPhone) }
    }

    /// The user's own number, learned from the agent's deep link. Identifies us to `/judge`.
    var userPhone: String {
        didSet { defaults?.set(userPhone, forKey: Keys.userPhone) }
    }

    /// True until the user finishes first-launch setup.
    var needsSetup: Bool { contactPhone.isEmpty }

    private var defaults: UserDefaults? { AppGroup.container }

    private enum Keys {
        static let userName = "userName"
        static let interventionLevel = "interventionLevel"
        static let contactPhone = "contactPhone"
        static let userPhone = "userPhone"
        static let sessionActive = AppGroup.sessionActiveKey
    }

    init() {
        let d = AppGroup.container
        let stored = d?.string(forKey: Keys.interventionLevel)
        userName = d?.string(forKey: Keys.userName) ?? ""
        interventionLevel = stored.flatMap(InterventionLevel.init(rawValue:)) ?? .nudge
        contactPhone = d?.string(forKey: Keys.contactPhone) ?? ""
        userPhone = d?.string(forKey: Keys.userPhone) ?? ""
        setBroadcastSessionActive(false)
    }

    @discardableResult
    func handle(url: URL) -> Bool {
        guard url.scheme == "zenly",
              url.host == "session",
              url.path == "/start",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return false }

        let items = components.queryItems ?? []
        let isGuardian = items.first(where: { $0.name == "mode" })?.value == "guardian"
        let task = items.first(where: { $0.name == "task" })?.value
            ?? (isGuardian ? "" : "Focus session")
        let duration = items.first(where: { $0.name == "duration" })?.value.flatMap { Int($0) }
        // The agent embeds our own number so we can identify ourselves to /judge.
        if let phone = items.first(where: { $0.name == "phone" })?.value, !phone.isEmpty {
            userPhone = phone
        }

        start(mode: isGuardian ? .guardian : .task, task: task, durationMinutes: duration)
        return true
    }

    func start(mode: FocusMode = .task, task: String, durationMinutes: Int? = nil) {
        session = FocusSession(mode: mode, task: task, durationMinutes: durationMinutes, startedAt: Date())
        onTask = true
        nudgeCount = 0
        snitchCount = 0
        lastJudgeReason = ""
        lastJudgeAction = "none"
        setBroadcastSessionActive(true)
        syncSessionWithBackend(mode: mode, task: task, durationMinutes: durationMinutes)
        startJudgeLoop()
    }

    func end() {
        stopJudgeLoop()
        setBroadcastSessionActive(false)
        if let frameURL = AppGroup.latestFrameURL {
            try? FileManager.default.removeItem(at: frameURL)
        }
        if !userPhone.isEmpty {
            let phone = userPhone
            Task {
                _ = try? await apiClient.endSession(userPhone: phone)
            }
        }
        session = nil
        onTask = true
        judgeStatusText = "screen judge idle"
    }

    private func startJudgeLoop() {
        stopJudgeLoop()
        lastUploadedFrameModifiedAt = nil
        judgeStatusText = "start screen capture"
        judgeTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.judgeLatestFrameIfReady()
                try? await Task.sleep(nanoseconds: Self.judgeIntervalNanoseconds)
            }
        }
    }

    private func stopJudgeLoop() {
        judgeTask?.cancel()
        judgeTask = nil
        lastUploadedFrameModifiedAt = nil
    }

    private func judgeLatestFrameIfReady() async {
        guard let currentSession = session else {
            stopJudgeLoop()
            return
        }

        guard currentSession.isActive else {
            end()
            return
        }

        guard !userPhone.isEmpty else {
            judgeStatusText = "waiting for session identity"
            return
        }

        guard let frameURL = AppGroup.latestFrameURL else {
            judgeStatusText = "app group unavailable"
            return
        }

        guard FileManager.default.fileExists(atPath: frameURL.path) else {
            judgeStatusText = "start screen capture"
            return
        }

        let modifiedAt = ((try? FileManager.default.attributesOfItem(atPath: frameURL.path))?[.modificationDate] as? Date) ?? Date.distantPast
        if let lastUploadedFrameModifiedAt, modifiedAt <= lastUploadedFrameModifiedAt { return }

        let frameData: Data
        do {
            frameData = try Data(contentsOf: frameURL)
        } catch {
            judgeStatusText = "could not read frame"
            lastJudgeReason = error.localizedDescription
            return
        }

        guard !frameData.isEmpty else {
            judgeStatusText = "empty frame"
            return
        }

        judgeStatusText = "judging frame"
        do {
            let response = try await apiClient.judgeFrame(imageData: frameData, userPhone: userPhone)
            lastUploadedFrameModifiedAt = modifiedAt
            applyJudgeResponse(response)
        } catch {
            judgeStatusText = "judge upload failed"
            lastJudgeReason = error.localizedDescription
        }
    }

    private func applyJudgeResponse(_ response: JudgeResponse) {
        switch response.verdict.status {
        case "on_task", "ok":
            onTask = true
        default:
            onTask = false
        }

        lastJudgeReason = response.verdict.reason
        lastJudgeAction = response.action.type
        judgeStatusText = statusCopy(for: response)

        guard response.action.type == "escalate" else { return }
        switch response.action.level?.lowercased() {
        case "nudge":
            nudgeCount += 1
        case "block":
            judgeStatusText = "block requested — shield deferred"
        case "snitch":
            snitchCount += 1
            judgeStatusText = "snitch sent server-side"
        default:
            break
        }
    }

    private func statusCopy(for response: JudgeResponse) -> String {
        switch response.action.type {
        case "checkin":
            return "check-in sent"
        case "waiting":
            return "grace window active"
        case "escalate":
            return "escalating \(response.action.level ?? interventionLevel.label)"
        default:
            switch response.verdict.status {
            case "on_task": return "on task"
            case "off_task": return "off task"
            case "destructive": return "destructive pattern"
            case "ok": return "guardian ok"
            default: return response.verdict.status
            }
        }
    }

    private func setBroadcastSessionActive(_ active: Bool) {
        defaults?.set(active, forKey: Keys.sessionActive)
    }

    private func syncSessionWithBackend(mode: FocusMode, task: String, durationMinutes: Int?) {
        guard !userPhone.isEmpty else { return }

        let phone = userPhone
        let level = interventionLevel
        let contact = contactPhone
        let name = userName
        Task {
            do {
                _ = try await apiClient.startSession(
                    userPhone: phone,
                    mode: mode,
                    task: task,
                    durationMinutes: durationMinutes,
                    interventionLevel: level,
                    contactPhone: contact,
                    name: name
                )
            } catch {
                judgeStatusText = "session sync failed"
                lastJudgeReason = error.localizedDescription
            }
        }
    }
}

