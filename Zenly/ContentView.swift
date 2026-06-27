import SwiftUI

/// The Zenly agent's Photon/Spectrum iMessage number. Text this to start a session.
let MAC_IMESSAGE_HANDLE = "+14156035536"

struct ContentView: View {
    @Environment(SessionStore.self) private var store
    @State private var showingSettings = false

    var body: some View {
        ZenlyShell {
            if showingSettings {
                SettingsScreen(onDone: { showingSettings = false })
            } else if let session = store.session {
                RunningSessionView(session: session)
            } else {
                HomeScreen(onEditSettings: { showingSettings = true })
            }
        }
        .onAppear {
            if store.needsSetup { showingSettings = true }
        }
        .animation(.easeInOut(duration: 0.22), value: store.session != nil)
        .animation(.easeInOut(duration: 0.22), value: showingSettings)
    }
}

// MARK: - Shell (cloud background + dark fog)

private struct ZenlyShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .foregroundStyle(.white)
            .padding(.horizontal, 32)
            .padding(.vertical, 42)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(alignment: .center) {
                ZStack {
                    Color.black

                    Image("ZenlyCloud")
                        .resizable()
                        .scaledToFill()
                        .saturation(0)
                        .contrast(0.9)
                        .opacity(0.22)
                        .blur(radius: 2)

                    // Strong scrim: the cloud has bright puffs, so keep it dim
                    // enough that white type always reads.
                    LinearGradient(
                        colors: [
                            .black.opacity(0.45),
                            .black.opacity(0.30),
                            .black.opacity(0.58)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .ignoresSafeArea()
            }
            .preferredColorScheme(.dark)
    }
}

// MARK: - Home / waiting screen

private struct HomeScreen: View {
    @Environment(SessionStore.self) private var store
    @Environment(\.openURL) private var openURL
    let onEditSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Zenly.")
                .font(.redaction(size: 58, weight: .bold))
                .tracking(-1.2)
                .padding(.top, 8)

            Text("text us to start a focus session.\nwe send back a link that kicks it off.")
                .font(.redactionItalic(size: 20))
                .lineSpacing(3)
                .opacity(0.82)
                .padding(.top, 22)
                .frame(maxWidth: 320, alignment: .leading)

            Button(action: textTheAgent) {
                Text("text the agent")
                    .font(.redaction(size: 40, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 132)
            }
            .buttonStyle(ZenlyStartButtonStyle())
            .disabled(MAC_IMESSAGE_HANDLE.isEmpty)
            .opacity(MAC_IMESSAGE_HANDLE.isEmpty ? 0.55 : 1)
            .padding(.top, 44)

            Spacer()

            SettingsSummary(onEdit: onEditSettings)

            Text("choose your consequence")
                .font(.redactionItalic(size: 16))
                .opacity(0.7)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func textTheAgent() {
        guard !MAC_IMESSAGE_HANDLE.isEmpty,
              let url = URL(string: "sms:\(MAC_IMESSAGE_HANDLE)") else { return }
        openURL(url)
    }
}

private struct SettingsSummary: View {
    @Environment(SessionStore.self) private var store
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SummaryRow(key: "mode", value: store.interventionLevel.rawValue.lowercased())
            SummaryRow(key: "witness",
                       value: store.contactPhone.isEmpty ? "not set" : store.contactPhone)

            Button(action: onEdit) {
                Text("edit settings ›")
                    .font(.redactionItalic(size: 17))
                    .opacity(0.88)
            }
            .buttonStyle(.plain)
            .padding(.top, 2)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(.white.opacity(0.85), lineWidth: 1.6))
    }
}

private struct SummaryRow: View {
    let key: String
    let value: String

    var body: some View {
        HStack {
            Text(key)
                .font(.redactionItalic(size: 18))
                .opacity(0.72)
            Spacer()
            Text(value)
                .font(.redaction(size: 20, weight: .bold))
        }
    }
}

// MARK: - Settings (first launch + editable)

private struct SettingsScreen: View {
    @Environment(SessionStore.self) private var store
    let onDone: () -> Void

    var body: some View {
        @Bindable var store = store
        VStack(alignment: .leading, spacing: 0) {
            Text("Zenly.")
                .font(.redaction(size: 58, weight: .bold))
                .tracking(-1.2)
                .padding(.top, 8)

            Text("set up your accountability.")
                .font(.redactionItalic(size: 20))
                .opacity(0.82)
                .padding(.top, 18)

            Text("your name")
                .font(.redactionItalic(size: 18))
                .opacity(0.7)
                .padding(.top, 30)
            NameField(text: $store.userName)
                .padding(.top, 10)

            Text("witness")
                .font(.redactionItalic(size: 18))
                .opacity(0.7)
                .padding(.top, 26)
            PhoneField(text: $store.contactPhone)
                .padding(.top, 10)
            Text("who we text when you wander off. stays on your phone.")
                .font(.redactionItalic(size: 15))
                .opacity(0.66)
                .padding(.top, 8)

            Text("consequence")
                .font(.redactionItalic(size: 18))
                .opacity(0.7)
                .padding(.top, 34)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(InterventionLevel.allCases) { level in
                    Button {
                        store.interventionLevel = level
                    } label: {
                        ModeRow(level: level, selected: store.interventionLevel == level)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 12)

            Text(store.interventionLevel.detail)
                .font(.redactionItalic(size: 17))
                .lineSpacing(2)
                .opacity(0.8)
                .padding(.top, 14)
                .frame(maxWidth: 320, alignment: .leading)

            Spacer()

            Button(action: onDone) {
                Text("done")
                    .font(.redaction(size: 30, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 64)
            }
            .buttonStyle(ZenlyOutlineButtonStyle())
            .disabled(store.contactPhone.isEmpty)
            .opacity(store.contactPhone.isEmpty ? 0.45 : 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ModeRow: View {
    let level: InterventionLevel
    let selected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(selected ? .white : .clear)
                .frame(width: 13, height: 13)
                .overlay(Rectangle().stroke(.white, lineWidth: 1.6))

            HStack(spacing: 8) {
                Text("The")
                    .font(.redaction(size: 34, weight: .bold))
                Text(level.rawValue.lowercased())
                    .font(.redactionItalic(size: 34))
            }
            .opacity(selected ? 1 : 0.6)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Running session (live timer)

private struct RunningSessionView: View {
    let session: FocusSession
    @Environment(SessionStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle()
                    .fill(.white)
                    .frame(width: 9, height: 9)
                    .shadow(color: .white.opacity(0.7), radius: 7)
                Text("session running")
                    .font(.redactionItalic(size: 18))
                    .opacity(0.86)
            }
            .padding(.top, 8)

            Text(store.interventionLevel.rawValue)
                .font(.redaction(size: 60, weight: .bold))
                .tracking(-0.8)
                .padding(.top, 36)

            Text(session.isGuardian ? "guardian mode" : "currently focusing on")
                .font(.redactionItalic(size: 20))
                .opacity(0.82)
                .padding(.top, 26)

            Text(session.isGuardian ? "no task — just keeping you off the bad stuff" : session.task)
                .font(.redaction(size: session.isGuardian ? 24 : 32, weight: .bold))
                .lineSpacing(5)
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
                .overlay(Rectangle().stroke(.white, lineWidth: 2))
                .padding(.top, 10)

            TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
                TimerBlock(session: session, now: context.date)
            }
            .padding(.top, 22)

            Spacer()

            HStack(spacing: 16) {
                SessionSignal(active: store.onTask)
                    #if DEBUG
                    .onTapGesture { store.onTask.toggle() }  // debug: simulate focus judge
                    #endif

                Spacer()

                Button("end") { store.end() }
                    .font(.redactionItalic(size: 24))
                    .foregroundStyle(.white)
                    .buttonStyle(.plain)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .overlay(Rectangle().stroke(.white, lineWidth: 1.5))
            }
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Live countdown for timed sessions (with a brutalist progress bar), elapsed for indefinite.
private struct TimerBlock: View {
    let session: FocusSession
    let now: Date

    private var elapsed: TimeInterval { max(0, now.timeIntervalSince(session.startedAt)) }

    private var total: TimeInterval? {
        session.durationMinutes.map { Double($0 * 60) }
    }

    private var progress: Double? {
        guard let total, total > 0 else { return nil }
        return min(1, elapsed / total)
    }

    private var displayed: TimeInterval {
        guard let total else { return elapsed }
        return max(0, total - elapsed)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(clockString(displayed))
                    .font(.redaction(size: 52, weight: .bold))
                Text(progress == nil ? "elapsed" : "remaining")
                    .font(.redactionItalic(size: 17))
                    .opacity(0.72)
            }

            if let progress {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(.white.opacity(0.12))
                        Rectangle()
                            .fill(.white)
                            .frame(width: geo.size.width * progress)
                            .animation(.easeInOut, value: progress)
                    }
                    .overlay(Rectangle().stroke(.white, lineWidth: 2))
                }
                .frame(height: 16)
            }
        }
    }

    private func clockString(_ interval: TimeInterval) -> String {
        let t = Int(interval.rounded())
        let h = t / 3600, m = (t % 3600) / 60, s = t % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%02d:%02d", m, s)
    }
}

private struct SessionSignal: View {
    let active: Bool

    var body: some View {
        HStack(spacing: 9) {
            Rectangle()
                .fill(active ? .white : .clear)
                .frame(width: 11, height: 11)
                .overlay(Rectangle().stroke(.white, lineWidth: 1.4))
            Text(active ? "on task" : "off task")
                .font(.redactionItalic(size: 18))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .foregroundStyle(active ? .white : Color.zenlyFog)
        .background(active ? .clear : .white)
        .overlay(Rectangle().stroke(.white, lineWidth: 1.4))
    }
}

// MARK: - Shared pieces

private struct PhoneField: View {
    @Binding var text: String

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text("accountability contact")
                    .font(.redactionItalic(size: 20))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 14)
                    .allowsHitTesting(false)
            }
            TextField("", text: $text)
                .font(.redactionItalic(size: 20))
                .foregroundStyle(.white)
                .tint(.white)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .padding(.horizontal, 14)
        }
        .frame(height: 58)
        .overlay(Rectangle().stroke(.white, lineWidth: 1.8))
    }
}

private struct NameField: View {
    @Binding var text: String

    var body: some View {
        ZStack(alignment: .leading) {
            if text.isEmpty {
                Text("what should we call you?")
                    .font(.redactionItalic(size: 20))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 14)
                    .allowsHitTesting(false)
            }
            TextField("", text: $text)
                .font(.redactionItalic(size: 20))
                .foregroundStyle(.white)
                .tint(.white)
                .textContentType(.givenName)
                .autocorrectionDisabled()
                .padding(.horizontal, 14)
        }
        .frame(height: 58)
        .overlay(Rectangle().stroke(.white, lineWidth: 1.8))
    }
}

private struct ZenlyStartButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.zenlyFog : .white)
            .background(configuration.isPressed ? .white : .white.opacity(0.02))
            .overlay(Rectangle().stroke(.white, lineWidth: 5))
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

private struct ZenlyOutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.zenlyFog : .white)
            .background(configuration.isPressed ? .white : .white.opacity(0.02))
            .overlay(Rectangle().stroke(.white, lineWidth: 2.5))
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

// MARK: - Redaction type + palette

private enum RedactionWeight { case regular, bold }

private extension Font {
    static func redaction(size: CGFloat, weight: RedactionWeight = .regular) -> Font {
        switch weight {
        case .regular: return .custom("Redaction10-Regular", size: size)
        case .bold:    return .custom("Redaction10-Bold", size: size)
        }
    }

    static func redactionItalic(size: CGFloat) -> Font {
        .custom("Redaction10-Italic", size: size)
    }
}

private extension Color {
    static let zenlyFog = Color(red: 0.40, green: 0.40, blue: 0.39)
}

private extension InterventionLevel {
    /// Longer description shown under the picker in settings.
    var detail: String {
        switch self {
        case .nudge:
            return "gentle pressure. we remind you before you drift."
        case .block:
            return "hard edges. the session is protected once it begins."
        case .snitch:
            return "accountability with teeth. wander off and someone hears about it."
        }
    }
}

// MARK: - Previews

#Preview("Home") {
    ContentView().environment(SessionStore())
}

#Preview("Settings") {
    let store = SessionStore()
    store.contactPhone = "7034732803"
    return ContentView().environment(store)
}

#Preview("Running – timed") {
    let store = SessionStore()
    store.contactPhone = "7034732803"
    store.interventionLevel = .snitch
    store.start(task: "finish the history essay", durationMinutes: 45)
    return ContentView().environment(store)
}

#Preview("Running – indefinite") {
    let store = SessionStore()
    store.contactPhone = "7034732803"
    store.start(task: "deep work")
    return ContentView().environment(store)
}
