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

struct WaitingView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("Zenly")
                .font(.largeTitle.bold())
            Text("Text the Zenly agent to start a focus session.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}

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

            if let endsAt = session.endsAt {
                Text("Ends \(endsAt.formatted(date: .omitted, time: .shortened))")
                    .foregroundStyle(.secondary)
            } else {
                Text("No time limit")
                    .foregroundStyle(.secondary)
            }

            Button("End session", role: .destructive) { store.end() }
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

#Preview("Waiting") {
    ContentView().environment(SessionStore())
}

#Preview("Active – timed") {
    let store = SessionStore()
    store.start(task: "History essay", durationMinutes: 45)
    ContentView().environment(store)
}

#Preview("Active – indefinite") {
    let store = SessionStore()
    store.start(task: "Deep work")
    ContentView().environment(store)
}
