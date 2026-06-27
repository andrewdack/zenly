import Foundation
import Observation

enum AppGroup {
    static let identifier = "group.com.andrewh.zenly"
    static var container: UserDefaults? { UserDefaults(suiteName: identifier) }
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

@Observable
final class SessionStore {
    var session: FocusSession?
    var onTask: Bool = true
    var nudgeCount: Int = 0
    var snitchCount: Int = 0

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
    }

    init() {
        let d = AppGroup.container
        let stored = d?.string(forKey: Keys.interventionLevel)
        userName = d?.string(forKey: Keys.userName) ?? ""
        interventionLevel = stored.flatMap(InterventionLevel.init(rawValue:)) ?? .nudge
        contactPhone = d?.string(forKey: Keys.contactPhone) ?? ""
        userPhone = d?.string(forKey: Keys.userPhone) ?? ""
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
    }

    func end() { session = nil }
}
