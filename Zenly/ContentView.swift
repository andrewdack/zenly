import SwiftUI

struct ContentView: View {
    @Environment(SessionStore.self) private var store
    @State private var focusText = ""
    @State private var selectedLevel: InterventionLevel?

    var body: some View {
        ZenlyShell {
            if let session = store.session {
                RunningSessionView(session: session)
            } else if let selectedLevel {
                InterventionScreen(
                    level: selectedLevel,
                    focusText: $focusText,
                    onBack: { self.selectedLevel = nil },
                    onStart: { task in
                        store.interventionLevel = selectedLevel
                        store.start(task: task)
                    }
                )
            } else {
                HomeScreen(
                    focusText: $focusText,
                    onSelect: { selectedLevel = $0 }
                )
            }
        }
        .animation(.easeInOut(duration: 0.22), value: store.session != nil)
        .animation(.easeInOut(duration: 0.22), value: selectedLevel?.id)
    }
}

private struct ZenlyShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            Color.zenlyFog.ignoresSafeArea()

            Image("ZenlyCloud")
                .resizable()
                .scaledToFill()
                .saturation(0)
                .contrast(0.78)
                .opacity(0.34)
                .blur(radius: 1.8)
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    .black.opacity(0.03),
                    .white.opacity(0.10),
                    .black.opacity(0.10)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            content
                .foregroundStyle(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 42)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .preferredColorScheme(.dark)
    }
}

private struct HomeScreen: View {
    @Binding var focusText: String
    let onSelect: (InterventionLevel) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Zenly.")
                .font(.redaction(size: 58, weight: .bold))
                .tracking(-1.2)
                .padding(.top, 8)

            FocusTextArea(text: $focusText)
                .padding(.top, 88)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(InterventionLevel.allCases) { level in
                    Button {
                        onSelect(level)
                    } label: {
                        ModeTitle(level: level)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 26)

            Spacer()

            Text("choose your consequence")
                .font(.redactionItalic(size: 18))
                .opacity(0.78)
                .padding(.bottom, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct InterventionScreen: View {
    let level: InterventionLevel
    @Binding var focusText: String
    let onBack: () -> Void
    let onStart: (String) -> Void

    private var task: String {
        focusText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BackButton(action: onBack)
                .padding(.top, 2)

            Text(level.rawValue)
                .font(.redaction(size: 68, weight: .bold))
                .tracking(-0.8)
                .padding(.top, 42)

            Text(level.description)
                .font(.redactionItalic(size: 20))
                .lineSpacing(3)
                .opacity(0.82)
                .padding(.top, 12)
                .frame(maxWidth: 310, alignment: .leading)

            FocusTextArea(text: $focusText, compact: true)
                .padding(.top, 42)

            Spacer()

            Button {
                onStart(task.isEmpty ? level.defaultTask : task)
            } label: {
                Text("Start")
                    .font(.redaction(size: 66, weight: .bold))
                    .frame(maxWidth: .infinity, minHeight: 162)
            }
            .buttonStyle(ZenlyStartButtonStyle())
            .padding(.bottom, 66)

            Text(level.footnote)
                .font(.redactionItalic(size: 16))
                .opacity(0.75)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

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
                .font(.redaction(size: 66, weight: .bold))
                .tracking(-0.8)
                .padding(.top, 48)

            Text("currently focusing on")
                .font(.redactionItalic(size: 21))
                .opacity(0.82)
                .padding(.top, 30)

            Text(session.task)
                .font(.redaction(size: 38, weight: .bold))
                .lineSpacing(6)
                .padding(18)
                .frame(maxWidth: .infinity, minHeight: 128, alignment: .topLeading)
                .overlay(
                    Rectangle()
                        .stroke(.white, lineWidth: 2)
                )
                .padding(.top, 10)

            if let endsAt = session.endsAt {
                Text("ends \(endsAt.formatted(date: .omitted, time: .shortened))")
                    .font(.redactionItalic(size: 18))
                    .opacity(0.78)
                    .padding(.top, 18)
            }

            Spacer()

            HStack(spacing: 16) {
                SessionSignal(label: store.onTask ? "on task" : "off task")

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

private struct FocusTextArea: View {
    @Binding var text: String
    var compact = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            TextEditor(text: $text)
                .font(.redactionItalic(size: compact ? 19 : 22))
                .foregroundStyle(.white)
                .tint(.white)
                .scrollContentBackground(.hidden)
                .background(.clear)
                .padding(.horizontal, 8)
                .padding(.vertical, 7)

            if text.isEmpty {
                Text("what are you focusing on?")
                    .font(.redactionItalic(size: compact ? 19 : 22))
                    .foregroundStyle(.white.opacity(0.78))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 15)
                    .allowsHitTesting(false)
            }
        }
        .frame(height: compact ? 82 : 94)
        .overlay(
            Rectangle()
                .stroke(.white, lineWidth: 1.8)
        )
    }
}

private struct ModeTitle: View {
    let level: InterventionLevel

    var body: some View {
        HStack(spacing: 8) {
            Text("The")
                .font(.redaction(size: 44, weight: .bold))
            Text(level.rawValue.lowercased())
                .font(.redactionItalic(size: 44))
        }
        .contentShape(Rectangle())
    }
}

private struct BackButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                Text("‹")
                    .font(.redaction(size: 30, weight: .bold))
                Text("back")
                    .font(.redactionItalic(size: 21))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .overlay(Rectangle().stroke(.white.opacity(0.9), lineWidth: 1.4))
        }
        .buttonStyle(.plain)
    }
}

private struct SessionSignal: View {
    let label: String

    var body: some View {
        HStack(spacing: 9) {
            Rectangle()
                .fill(.white.opacity(0.95))
                .frame(width: 11, height: 11)
            Text(label)
                .font(.redactionItalic(size: 18))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .overlay(Rectangle().stroke(.white, lineWidth: 1.4))
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

private enum RedactionWeight {
    case regular
    case bold
}

private extension Font {
    static func redaction(size: CGFloat, weight: RedactionWeight = .regular) -> Font {
        switch weight {
        case .regular:
            return .custom("Redaction10-Regular", size: size)
        case .bold:
            return .custom("Redaction10-Bold", size: size)
        }
    }

    static func redactionItalic(size: CGFloat) -> Font {
        .custom("Redaction10-Italic", size: size)
    }
}

private extension Color {
    static let zenlyFog = Color(red: 0.58, green: 0.58, blue: 0.56)
}

private extension InterventionLevel {
    var description: String {
        switch self {
        case .nudge:
            return "gentle pressure. we remind you before you drift."
        case .block:
            return "hard edges. the session is protected once it begins."
        case .snitch:
            return "accountability with teeth. if you wander, someone hears about it."
        }
    }

    var footnote: String {
        switch self {
        case .nudge:
            return "soft but persistent"
        case .block:
            return "make the boundary real"
        case .snitch:
            return "you asked for witnesses"
        }
    }

    var defaultTask: String {
        switch self {
        case .nudge:
            return "staying focused"
        case .block:
            return "blocking distractions"
        case .snitch:
            return "being held accountable"
        }
    }
}

#Preview("Home") {
    ContentView().environment(SessionStore())
}

#Preview("Active") {
    let store = SessionStore()
    store.interventionLevel = .snitch
    store.start(task: "finish the history essay", durationMinutes: 45)
    ContentView().environment(store)
}
