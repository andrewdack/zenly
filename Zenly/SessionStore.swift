//
//  SessionStore.swift
//  Zenly
//
//  Holds the active focus session. Populated from the `zenly://` deep link
//  the SMS agent texts the user. Shared App Group ID lives here so every
//  target references one constant.
//

import Foundation
import Observation

enum AppGroup {
    /// Must match the App Group in every target's .entitlements file.
    static let identifier = "group.com.andrewh.zenly"

    static var container: UserDefaults? {
        UserDefaults(suiteName: identifier)
    }
}

/// A focus session as configured by the conversational SMS agent.
struct FocusSession: Equatable {
    var task: String
    var durationMinutes: Int
    var startedAt: Date

    var endsAt: Date { startedAt.addingTimeInterval(TimeInterval(durationMinutes * 60)) }
    var isActive: Bool { Date() < endsAt }
}

@Observable
final class SessionStore {
    var session: FocusSession?

    /// Live on-/off-task verdict from the vision judge (Phase 6).
    var onTask: Bool = true
    var nudgeCount: Int = 0
    var snitchCount: Int = 0

    /// Parse `zenly://session/start?task=...&duration=...` and begin a session.
    /// Returns true if the URL was a recognized Zenly deep link.
    @discardableResult
    func handle(url: URL) -> Bool {
        guard url.scheme == "zenly",
              url.host == "session",
              url.path == "/start",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return false }

        let items = components.queryItems ?? []
        let task = items.first(where: { $0.name == "task" })?.value ?? "Focus session"
        let duration = Int(items.first(where: { $0.name == "duration" })?.value ?? "") ?? 25

        start(task: task, durationMinutes: duration)
        return true
    }

    func start(task: String, durationMinutes: Int) {
        session = FocusSession(task: task, durationMinutes: durationMinutes, startedAt: Date())
        onTask = true
        nudgeCount = 0
        snitchCount = 0
    }

    func end() {
        session = nil
    }
}
