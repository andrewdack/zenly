import SwiftUI

/// iMessage handle for the Mac running the Zenly agent. Fill in before demo.
let MAC_IMESSAGE_HANDLE = ""

struct ContentView: View {
    @Environment(SessionStore.self) private var store
    @State private var showingSettings = false

    var body: some View {
        Group {
            if let session = store.session {
                ActiveSessionView(session: session)
            } else {
                WaitingView(showingSettings: $showingSettings)
            }
        }
        .onAppear {
            if store.needsSetup { showingSettings = true }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
    }
}

struct WaitingView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.openURL) private var openURL
    @Binding var showingSettings: Bool

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("zenly")
                .font(.largeTitle.bold())
            Text("text us to kick off a focus session — tell us what you're working on and for how long.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                openAgentChat()
            } label: {
                Label("text the agent", systemImage: "message.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(MAC_IMESSAGE_HANDLE.isEmpty)
            .padding(.horizontal, 40)

            Spacer()

            settingsSummary
        }
        .padding()
    }

    private var settingsSummary: some View {
        VStack(spacing: 8) {
            HStack {
                Text("intervention")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(store.interventionLevel.label)
            }
            HStack {
                Text("accountability buddy")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(store.contactPhone.isEmpty ? "not set" : store.contactPhone)
                    .foregroundStyle(store.contactPhone.isEmpty ? .orange : .primary)
            }
            Button("edit settings") { showingSettings = true }
                .font(.footnote)
                .padding(.top, 4)
        }
        .font(.footnote)
        .padding()
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }

    private func openAgentChat() {
        let handle = MAC_IMESSAGE_HANDLE
        guard !handle.isEmpty,
              let url = URL(string: "sms:\(handle)") else { return }
        openURL(url)
    }
}

struct SettingsView: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section {
                    TextField("phone number", text: $store.contactPhone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                } header: {
                    Text("accountability buddy")
                } footer: {
                    Text("who we text when you go off the rails. lives only on your phone.")
                }

                Section {
                    Picker("level", selection: $store.interventionLevel) {
                        ForEach(InterventionLevel.allCases) { level in
                            Text(level.label).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text(store.interventionLevel.blurb)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("when you drift off task")
                }
            }
            .navigationTitle("settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("done") { dismiss() }
                        .disabled(store.contactPhone.isEmpty)
                }
            }
        }
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

#Preview("Settings") {
    SettingsView().environment(SessionStore())
}

#Preview("Active – timed") {
    let store = SessionStore()
    store.start(task: "History essay", durationMinutes: 45)
    return ContentView().environment(store)
}

#Preview("Active – indefinite") {
    let store = SessionStore()
    store.start(task: "Deep work")
    return ContentView().environment(store)
}
