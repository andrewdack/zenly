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
}

struct FocusSession: Equatable {
    var task: String
    var durationMinutes: Int?   // nil = indefinite
    var startedAt: Date

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
    var interventionLevel: InterventionLevel = .nudge
    var contactPhone: String = ""

    @discardableResult
    func handle(url: URL) -> Bool {
        guard url.scheme == "zenly",
              url.host == "session",
              url.path == "/start",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return false }

        let items = components.queryItems ?? []
        let task = items.first(where: { $0.name == "task" })?.value ?? "Focus session"
        let duration = items.first(where: { $0.name == "duration" })?.value.flatMap { Int($0) }

        start(task: task, durationMinutes: duration)
        return true
    }

    func start(task: String, durationMinutes: Int? = nil) {
        session = FocusSession(task: task, durationMinutes: durationMinutes, startedAt: Date())
        onTask = true
        nudgeCount = 0
        snitchCount = 0
    }

    func end() { session = nil }
}
