import SwiftUI
#if canImport(ReplayKit)
import ReplayKit
#endif
#if canImport(UIKit)
import UIKit
#endif

/// The Zenly agent's Photon/Spectrum iMessage number. Text this to start a session.
let MAC_IMESSAGE_HANDLE = "+14156035536"
/// Demo API base URL. Phone must be on the same Wi-Fi as this Mac.
let API_BASE_URL = URL(string: "http://192.168.7.29:3001")!
/// ReplayKit upload extension bundle id.
let BROADCAST_EXTENSION_BUNDLE_IDENTIFIER = "andrew.Zenly.ZenlyBroadcast"

struct ContentView: View {
    @Environment(SessionStore.self) private var store
    @State private var showingSettings = false
    @State private var showingProfile = false
    @State private var showingStopBroadcastAlert = false

    var body: some View {
        ZenlyShell {
            if showingProfile {
                ProfileScreen(onDone: { showingProfile = false })
            } else if showingSettings {
                SettingsScreen(onDone: { showingSettings = false })
            } else if let session = store.session {
                RunningSessionView(session: session) {
                    store.end()
                    showingStopBroadcastAlert = true
                }
            } else {
                HomeScreen(
                    onEditSettings: { showingSettings = true },
                    onShowProfile: { showingProfile = true }
                )
            }
        }
        .onAppear {
            if store.needsSetup { showingSettings = true }
        }
        .animation(.easeInOut(duration: 0.22), value: store.session != nil)
        .animation(.easeInOut(duration: 0.22), value: showingSettings)
        .animation(.easeInOut(duration: 0.22), value: showingProfile)
        .alert("stop screen capture", isPresented: $showingStopBroadcastAlert) {
            Button("got it", role: .cancel) {}
        } message: {
            Text("zenly stopped uploading. end the red screen-recording broadcast from the system ui too.")
        }
    }
}

// MARK: - Shell (cloud background + dark fog)

private struct ZenlyShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                content
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 42)
                    // Fill the viewport when content is short (keeps the centered
                    // layout), but grow + scroll when it's taller than the screen.
                    .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
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
    let onShowProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Zenly.")
                .font(.redaction(size: 58, weight: .bold))
                .tracking(-1.2)
                .padding(.top, 8)

            Text("text Zenly to define your goals and click the link to start.")
                .font(.redactionItalic(size: 20))
                .lineSpacing(3)
                .opacity(0.82)
                .padding(.top, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            Button(action: textTheAgent) {
                Text("text the agent")
                    .font(.redaction(size: 40, weight: .bold))
                    .minimumScaleFactor(0.72)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 34)
            }
            .buttonStyle(ZenlyStartButtonStyle())
            .disabled(MAC_IMESSAGE_HANDLE.isEmpty)
            .opacity(MAC_IMESSAGE_HANDLE.isEmpty ? 0.55 : 1)
            .padding(.top, 44)

            Spacer()

            SettingsSummary(onEdit: onEditSettings, onProfile: onShowProfile)

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
    let onProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SummaryRow(key: "mode", value: store.interventionLevel.rawValue.lowercased())
            SummaryRow(key: "witness",
                       value: store.contactPhone.isEmpty ? "not set" : DisplayFormat.phone(store.contactPhone))

            HStack(spacing: 18) {
                Button(action: onEdit) {
                    Text("edit settings ›")
                        .font(.redactionItalic(size: 17))
                        .opacity(0.88)
                }
                .buttonStyle(.plain)

                if !store.userPhone.isEmpty {
                    Button(action: onProfile) {
                        Text("profile ›")
                            .font(.redactionItalic(size: 17))
                            .opacity(0.88)
                    }
                    .buttonStyle(.plain)
                }
            }
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
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                keyText
                Spacer(minLength: 8)
                valueText
                    .multilineTextAlignment(.trailing)
            }

            VStack(alignment: .leading, spacing: 2) {
                keyText
                valueText
                    .multilineTextAlignment(.leading)
            }
        }
    }

    private var keyText: some View {
        Text(key)
            .font(.redactionItalic(size: 18))
            .opacity(0.72)
            .fixedSize(horizontal: true, vertical: false)
    }

    private var valueText: some View {
        Text(value)
            .font(.redaction(size: 20, weight: .bold))
            .lineLimit(3)
            .minimumScaleFactor(0.72)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .layoutPriority(1)
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

            Text("your phone")
                .font(.redactionItalic(size: 18))
                .opacity(0.7)
                .padding(.top, 26)
            PhoneField(text: $store.userPhone)
                .padding(.top, 10)

            Text("witness")
                .font(.redactionItalic(size: 18))
                .opacity(0.7)
                .padding(.top, 26)
            PhoneField(text: $store.contactPhone)
                .padding(.top, 10)
            Text(contactHint)
                .font(.redactionItalic(size: 15))
                .opacity(0.66)
                .padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)

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
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()

            Button(action: finishSettings) {
                Text("done")
                    .font(.redaction(size: 30, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
            .buttonStyle(ZenlyOutlineButtonStyle())
            .disabled(store.contactPhone.isEmpty)
            .opacity(store.contactPhone.isEmpty ? 0.45 : 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("done") { dismissKeyboard() }
                    .font(.redactionItalic(size: 18))
            }
        }
    }

    private var contactHint: String {
        let trimmed = store.contactPhone.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "example: +1 (415) 555-0123"
        }
        return "will text \(DisplayFormat.phone(trimmed)) if you doomscroll or get distracted."
    }

    private func finishSettings() {
        dismissKeyboard()
        onDone()
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
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(level.rawValue.lowercased())
                    .font(.redactionItalic(size: 34))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .opacity(selected ? 1 : 0.6)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Running session (live timer)

private struct RunningSessionView: View {
    let session: FocusSession
    let onEnd: () -> Void
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
                .fixedSize(horizontal: false, vertical: true)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .overlay(Rectangle().stroke(.white, lineWidth: 2))
                .padding(.top, 10)

            TimelineView(.periodic(from: session.startedAt, by: 1)) { context in
                TimerBlock(session: session, now: context.date)
            }
            .padding(.top, 22)

            BroadcastStartCard()
                .padding(.top, 20)

            JudgeStatusCard()
                .padding(.top, 12)

            Spacer()

            HStack(spacing: 16) {
                SessionSignal(active: store.onTask)
                    #if DEBUG
                    .onTapGesture { store.onTask.toggle() }  // debug: simulate focus judge
                    #endif

                Spacer()

                Button("end", action: onEnd)
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

/// Holds a weak reference to the RPSystemBroadcastPickerView so BroadcastStartCard
/// can programmatically trigger the system broadcast picker sheet on session start.
private final class BroadcastPickerHolder {
    #if canImport(ReplayKit) && canImport(UIKit)
    weak var view: RPSystemBroadcastPickerView?

    func triggerPicker() {
        guard let view else { return }
        for sub in view.subviews {
            if let btn = sub as? UIButton {
                btn.sendActions(for: .touchUpInside)
                return
            }
        }
    }
    #endif
}

private struct BroadcastStartCard: View {
    @State private var holder = BroadcastPickerHolder()
    @State private var didAutoTrigger = false

    var body: some View {
        HStack(spacing: 14) {
            BroadcastPickerButton(holder: holder)
                .frame(width: 46, height: 46)
                .overlay(Rectangle().stroke(.white, lineWidth: 1.6))

            VStack(alignment: .leading, spacing: 3) {
                Text("screen capture")
                    .font(.redaction(size: 22, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(didAutoTrigger ? "accept the system prompt" : "tap to start recording")
                    .font(.redactionItalic(size: 15))
                    .lineLimit(2)
                    .minimumScaleFactor(0.82)
                    .opacity(0.72)
            }
            .layoutPriority(1)

            Spacer(minLength: 0)
        }
        .padding(14)
        .overlay(Rectangle().stroke(.white.opacity(0.78), lineWidth: 1.4))
        .task {
            // Auto-present the broadcast picker ~0.8s after the session view appears,
            // so the user gets prompted to start recording without finding the button.
            try? await Task.sleep(nanoseconds: 800_000_000)
            #if canImport(ReplayKit) && canImport(UIKit)
            holder.triggerPicker()
            didAutoTrigger = true
            #endif
        }
    }
}

private struct JudgeStatusCard: View {
    @Environment(SessionStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SummaryRow(key: "judge", value: store.judgeStatusText)
            SummaryRow(key: "api", value: DisplayFormat.apiBaseURL(API_BASE_URL))
            if !store.userPhone.isEmpty {
                SummaryRow(key: "phone", value: DisplayFormat.phone(store.userPhone))
            }
            if !store.lastJudgeReason.isEmpty {
                Text(store.lastJudgeReason)
                    .font(.redactionItalic(size: 15))
                    .fixedSize(horizontal: false, vertical: true)
                    .opacity(0.72)
            }
        }
        .padding(14)
        .overlay(Rectangle().stroke(.white.opacity(0.55), lineWidth: 1.2))
    }
}

#if canImport(ReplayKit) && canImport(UIKit)
private struct BroadcastPickerButton: UIViewRepresentable {
    let holder: BroadcastPickerHolder

    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 46, height: 46))
        picker.preferredExtension = BROADCAST_EXTENSION_BUNDLE_IDENTIFIER
        picker.showsMicrophoneButton = false
        picker.tintColor = .white
        holder.view = picker
        return picker
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {
        uiView.preferredExtension = BROADCAST_EXTENSION_BUNDLE_IDENTIFIER
        uiView.showsMicrophoneButton = false
        uiView.tintColor = .white
    }
}
#else
private struct BroadcastPickerButton: View {
    let holder: BroadcastPickerHolder
    var body: some View {
        Text("◉")
            .font(.redaction(size: 28, weight: .bold))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
#endif

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
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
                Text(progress == nil ? "elapsed" : "remaining")
                    .font(.redactionItalic(size: 17))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
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
        EditableTextField(
            placeholder: "accountability contact",
            text: $text,
            keyboardType: .phonePad,
            textContentType: .telephoneNumber
        )
    }
}

private struct NameField: View {
    @Binding var text: String

    var body: some View {
        EditableTextField(
            placeholder: "what should we call you?",
            text: $text,
            keyboardType: .default,
            textContentType: .givenName,
            autocorrectionDisabled: true,
            capitalization: .words
        )
    }
}

private struct EditableTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var textContentType: UITextContentType? = nil
    var autocorrectionDisabled = false
    var capitalization: TextInputAutocapitalization = .never

    var body: some View {
        HStack(spacing: 8) {
            TextField(
                "",
                text: $text,
                prompt: Text(placeholder)
                    .font(.redactionItalic(size: 20))
                    .foregroundColor(.white.opacity(0.68))
            )
            .font(.redactionItalic(size: 20))
            .foregroundStyle(.white)
            .tint(.white)
            .keyboardType(keyboardType)
            .textContentType(textContentType)
            .textInputAutocapitalization(capitalization)
            .autocorrectionDisabled(autocorrectionDisabled)
            .submitLabel(.done)
            .onSubmit { dismissKeyboard() }
            .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)

            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Text("×")
                        .font(.redaction(size: 24, weight: .bold))
                        .frame(width: 34, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("clear \(placeholder)")
            }
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
        .contentShape(Rectangle())
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

private enum DisplayFormat {
    static func apiBaseURL(_ url: URL) -> String {
        let host = url.host ?? url.absoluteString
        if let port = url.port {
            return "\(host):\(port)"
        }
        return host
    }

    static func phone(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "not set" }

        let digits = String(trimmed.filter { $0.isNumber })
        if digits.count == 11, digits.first == "1" {
            return "+1 (\(chunk(digits, 1, 3))) \(chunk(digits, 4, 3))-\(chunk(digits, 7, 4))"
        }
        if digits.count == 10 {
            return "(\(chunk(digits, 0, 3))) \(chunk(digits, 3, 3))-\(chunk(digits, 6, 4))"
        }
        if trimmed.hasPrefix("+"), !digits.isEmpty {
            return "+\(digits)"
        }
        return trimmed
    }

    private static func chunk(_ digits: String, _ start: Int, _ length: Int) -> String {
        let chars = Array(digits)
        guard start >= 0, chars.count >= start + length else { return "" }
        return String(chars[start..<(start + length)])
    }
}

private func dismissKeyboard() {
    #if canImport(UIKit)
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
}

private extension InterventionLevel {
    /// Longer description shown under the picker in settings.
    var detail: String {
        switch self {
        case .nudge:
            return "gentle pressure and reminders to get back on task."
        case .snitch:
            return "stay accountable or else someone else will hear about it..."
        }
    }
}

// MARK: - Profile screen

private struct ProfileScreen: View {
    @Environment(SessionStore.self) private var store
    let onDone: () -> Void

    @State private var profileData: ProfileResponse?
    @State private var loadError = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("profile.")
                .font(.redaction(size: 58, weight: .bold))
                .tracking(-1.2)
                .padding(.top, 8)

            if let data = profileData {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        ProfileStatsCard(data: data)
                        if !data.memories.isEmpty {
                            MemoriesCard(memories: data.memories)
                        }
                        if !data.recentVerdicts.isEmpty {
                            RecentVerdictsCard(verdicts: data.recentVerdicts)
                        }
                    }
                    .padding(.top, 20)
                }
            } else if loadError {
                Text("couldn't load — no connection?")
                    .font(.redactionItalic(size: 18))
                    .opacity(0.72)
                    .padding(.top, 24)
            } else {
                Text("loading...")
                    .font(.redactionItalic(size: 18))
                    .opacity(0.55)
                    .padding(.top, 24)
            }

            Spacer()

            Button(action: onDone) {
                Text("back")
                    .font(.redaction(size: 30, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            }
            .buttonStyle(ZenlyOutlineButtonStyle())
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task {
            guard !store.userPhone.isEmpty else { return }
            do {
                profileData = try await ZenlyAPIClient().fetchProfile(userPhone: store.userPhone)
            } catch {
                loadError = true
            }
        }
    }
}

private struct ProfileStatsCard: View {
    let data: ProfileResponse

    private var onTaskPct: Int {
        let total = data.stats.total
        guard total > 0 else { return 0 }
        let good = (data.stats.byStatus["on_task"] ?? 0) + (data.stats.byStatus["ok"] ?? 0)
        return Int(Double(good) / Double(total) * 100)
    }

    private var topOffense: String? {
        data.stats.byCategory.max(by: { $0.value < $1.value })?.key
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SummaryRow(key: "sessions judged", value: "\(data.stats.total)")
            SummaryRow(key: "on task", value: "\(onTaskPct)%")
            if let offense = topOffense {
                SummaryRow(key: "top weakness", value: offense)
            }
            SummaryRow(key: "check-ins", value: "\(data.stats.checkIns)")
            SummaryRow(key: "snitches", value: "\(data.stats.snitches)")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(.white.opacity(0.85), lineWidth: 1.6))
    }
}

private struct MemoriesCard: View {
    let memories: [MemoryItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("what we know about you")
                .font(.redactionItalic(size: 16))
                .opacity(0.7)

            ForEach(Array(memories.enumerated()), id: \.offset) { _, memory in
                HStack(alignment: .top, spacing: 10) {
                    Rectangle()
                        .fill(.white.opacity(0.6))
                        .frame(width: 5, height: 5)
                        .padding(.top, 7)
                    Text(memory.fact)
                        .font(.redactionItalic(size: 17))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(.white.opacity(0.6), lineWidth: 1.3))
    }
}

private struct RecentVerdictsCard: View {
    let verdicts: [RecentVerdict]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("recent checks")
                .font(.redactionItalic(size: 16))
                .opacity(0.7)

            ForEach(Array(verdicts.prefix(5).enumerated()), id: \.offset) { _, v in
                HStack(spacing: 10) {
                    Rectangle()
                        .fill(verdictColor(v.status))
                        .frame(width: 8, height: 8)
                    Text(v.reason)
                        .font(.redactionItalic(size: 15))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .opacity(0.85)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(.white.opacity(0.6), lineWidth: 1.3))
    }

    private func verdictColor(_ status: String) -> Color {
        switch status {
        case "on_task", "ok": return .white
        case "destructive":   return Color(red: 1, green: 0.35, blue: 0.35)
        default:              return Color.zenlyFog
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

#Preview("Profile") {
    let store = SessionStore()
    store.contactPhone = "7034732803"
    store.userPhone = "+15555550000"
    return ContentView().environment(store)
}
