//
//  ContentView.swift
//  Zenly
//
//  Created by Andrew Hu on 6/26/26.
//

import SwiftUI

struct ContentView: View {
    @Environment(SessionStore.self) private var store

    var body: some View {
        if let session = store.session {
            ActiveSessionView(session: session)
        } else {
            WaitingView()
        }
    }
}

/// Shown when no session is active — the user starts one by texting the agent.
struct WaitingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Zenly")
                .font(.largeTitle.bold())
            Text("Text the Zenly number to start a focus session.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

/// Minimal active-session screen (expanded in Phase 4: timer + status indicator).
struct ActiveSessionView: View {
    let session: FocusSession
    @Environment(SessionStore.self) private var store

    var body: some View {
        VStack(spacing: 20) {
            Text(session.task)
                .font(.title2.bold())
                .multilineTextAlignment(.center)

            Label(store.onTask ? "On task" : "Off task",
                  systemImage: store.onTask ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(store.onTask ? .green : .orange)
                .font(.headline)

            Text("Ends \(session.endsAt.formatted(date: .omitted, time: .shortened))")
                .foregroundStyle(.secondary)

            Button("End session", role: .destructive) { store.end() }
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

#Preview("Waiting") {
    ContentView().environment(SessionStore())
}

#Preview("Active") {
    let store = SessionStore()
    store.start(task: "History essay", durationMinutes: 45)
    return ContentView().environment(store)
}
