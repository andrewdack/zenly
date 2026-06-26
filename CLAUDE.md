# Zenly

Intent-aware distraction blocker with a conversational iMessage agent.

**User flow:**
1. First launch: user configures intervention level (nudge / block / snitch) and accountability
   contact in the app. This is a one-time setup.
2. To start a session: user iMessages the Mac running the backend. The agent collects the task
   and an optional duration (indefinite is fine). Agent replies with a deep link.
3. User taps the deep link → iOS app starts the focus session.
4. App captures screenshots (ReplayKit), backend vision model judges "on task" vs "off task".
5. Escalation follows the configured level: local notification → ManagedSettings shield →
   funny iMessage to the accountability contact (contact phone lives in the app, not the agent).

Hackathon project. macOS, Xcode 26.6, Node 24, iPhone target.

## Repo layout

```
Zenly.xcodeproj          # objectVersion 77 — uses PBXFileSystemSynchronizedRootGroup
Zenly/                   # main SwiftUI app target
ZenlyBroadcast/          # ReplayKit RPBroadcastSampleHandler (screen capture)  [App Groups]
ZenlyBroadcastSetupUI/   # ReplayKit setup UI extension                         [App Groups]
ZenlyActivity/           # DeviceActivityMonitor extension (shield)             [Family Controls — PAID ONLY]
ZenlyTests/ ZenlyUITests/
backend/                 # Node.js + Express + TypeScript: iMessage agent, vision judge, snitch
```

## Build order & status

| Phase | What | Status |
|------|------|--------|
| 1 | Xcode scaffold: 4 targets, entitlements, App Group, URL scheme | ✅ done, builds clean |
| 2 | Node backend scaffold: Express + provider-agnostic LLM + routes + iMessage watcher | ✅ done, smoke-tested |
| 3 | iMessage agent conversation loop (stateful, `<session>` parsing, iMessage reply) | ◐ built in `backend/src/agent/handler.ts`; activates when an LLM key is set |
| 4 | SwiftUI: settings screen (intervention level + contact), waiting screen, active-session timer | ◐ basic active screen exists; settings UI + timer TODO |
| 5 | ReplayKit broadcast: frame → JPEG → App Group container | ☐ todo |
| 6 | App polling loop: read frames → POST /judge → nudge/escalate | ☐ todo |
| 7 | DeviceActivityMonitor: read shield instruction → ManagedSettingsStore | ☐ todo (PAID — Family Controls) |
| 8 | Snitch escalation → POST /snitch → iMessage to accountability contact | ◐ `/snitch` route done; app passes contactPhone from settings; trigger todo |
| 9 | Demo polish: shield text, summary message, stats dashboard | ☐ todo |

## iOS project facts

- **Bundle ID**: `andrew.Zenly` (Xcode-generated). For free provisioning it must be globally
  unique — likely change to `com.andrewhu.zenly`. Extensions inherit the prefix.
- **App Group**: `group.com.andrewh.zenly` — declared in all four targets' `.entitlements`.
  The constant lives in `Zenly/SessionStore.swift` (`AppGroup.identifier`).
- **User settings** live in `SessionStore`: `interventionLevel` (nudge/block/snitch enum) and
  `contactPhone` (string). Configured in the app on first launch; passed to `/snitch` by the app
  — the iMessage agent never collects the contact phone.
- **URL scheme**: `zenly://`. Registered via `Zenly/Info.plist` (`CFBundleURLTypes`) merged with
  the generated Info.plist. Deep link: `zenly://session/start?task=<enc>&duration=<min>`.
  Handled in `ZenlyApp.swift` (`onOpenURL`) → `SessionStore.handle(url:)`.
- **Deployment target**: iOS 26.5. (Spec said iOS 18; Xcode 26 ships iOS 26 sims. No action needed.)
- **DEVELOPMENT_TEAM**: `8SPYVQ2PZH`.
- **Synchronized groups**: new `.swift` files dropped into a target folder auto-join that target —
  no `.pbxproj` edit needed for source. (Other file types may need a membership exception.)

### Entitlements (current = free-provisioning friendly)

- App (`Zenly/Zenly.entitlements`): **App Groups only**. Family Controls was removed so the app
  provisions on a free Personal Team.
- `ZenlyActivity/ZenlyActivity.entitlements`: Family Controls + App Groups (PAID only).
- Broadcast extensions: App Groups only.

### Free provisioning constraints (no paid Apple account yet)

- **Family Controls is the one capability free provisioning can't grant.** So ZenlyActivity (the
  shield extension) is paid-only. Everything else (Phases 1–6) runs on a free-provisioned device.
- To run on device free: **un-embed ZenlyActivity** (Zenly target → Build Phases → Embed Foundation
  Extensions → remove ZenlyActivity). Keep the two broadcast extensions embedded.
- If "Fix Issue" balks at App Groups on a Personal Team, App Groups is only used in Phase 5/6 — you
  can temporarily drop the `application-groups` key to run Phases 1–4.
- Free profiles expire in 7 days; 3-device limit.

### Re-enabling the shield (when paid)

1. Add `com.apple.developer.family-controls` = `true` back to `Zenly/Zenly.entitlements`.
2. Re-embed ZenlyActivity (Build Phases → Embed Foundation Extensions → +).
3. Signing & Capabilities → + Capability → Family Controls on app + ZenlyActivity.

### Build / run (iOS)

```bash
# compile all targets without signing (CI-style check)
xcodebuild -project Zenly.xcodeproj -scheme Zenly -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build CODE_SIGNING_ALLOWED=NO
```

Note: ReplayKit screen capture (Phase 5) and the shield (Phase 7) need a **physical device**; the
shield also needs a **paid account**. Phases 1–4 demo fine on the simulator.

## API server (`api/`)

TypeScript + Node + Express. **`api/` is the canonical server.** `backend/` is legacy reference.

**LLM**: everything goes through **OpenRouter** (OpenAI-compatible) — one `OPENROUTER_API_KEY`
covers both vision (focus judge) and agent chat. Model is configurable per role.

**Messaging** (dual-provider, same `MessageSender` interface):
- `photon` — cloud via `spectrum-ts` / Photon project credentials. No local Mac needed for sending.
- `local` — `@photon-ai/imessage-kit`, reads `~/Library/Messages/chat.db` + sends via AppleScript.
  Requires macOS + Full Disk Access. Auto-selected when Photon creds are absent.

**Receiving** (iMessage watcher): always local `imessage-kit` — the backend runs on a Mac anyway.
Watcher failure (no Full Disk Access) is non-fatal; server boots without it.

**Image format**: multipart JPEG (`POST /isFocused`, field name `image`). ReplayKit frames are
converted `CMSampleBuffer → CVPixelBuffer → UIImage → JPEG Data` before upload.

```
api/src/server.ts                       # entry: builds providers, starts Express + watcher
api/src/app.ts                          # createApp() — all routes, error handler
api/src/config.ts                       # env vars + getConfig()
api/src/types.ts                        # shared TS interfaces (Session, ChatMessage, etc.)
api/src/prompts.ts                      # agent + snitch system prompts
api/src/agent/handler.ts               # createAgentHandler() — iMessage conversation loop
api/src/store/sessions.ts              # in-memory session state per phone number
api/src/util/deeplink.ts               # startLink() — %20 encoding (NOT "+")
api/src/services/visionProvider.ts     # VisionProvider interface
api/src/services/openAiFocusProvider.ts # OpenRouter vision implementation
api/src/services/messageSender.ts      # MessageSender interface
api/src/services/photonMessenger.ts    # cloud send via spectrum-ts
api/src/services/imessageKitMessenger.ts # local send + exposes .sdk for the watcher
api/src/http.ts                        # asyncHandler + HttpError helpers
```

### Run

```bash
cd api
npm install
cp .env.example .env   # add OPENROUTER_API_KEY; optionally add Photon creds
# For local messaging: grant Full Disk Access to Terminal → System Preferences → Privacy & Security
npm run dev            # tsx watch src/server.ts  (port 3001)
```

### Routes

| Method | Path | Body / purpose |
|--------|------|----------------|
| GET  | `/health`           | `{ ok: true }` |
| POST | `/isFocused`        | multipart: `image` (JPEG) + optional `task` form field → `{ isFocused, confidence, reason }` |
| POST | `/sendMessage`      | `{ to, message }` → send iMessage via configured provider |
| POST | `/session/start`    | `{ userPhone, task, durationMinutes? }` → session + deeplink |
| GET  | `/session/:phone`   | active session + stats + deeplink |
| POST | `/snitch`           | `{ task, contactPhone, screenContent, userPhone? }` → LLM-generated shame iMessage |

Inbound messages arrive via the local iMessage watcher, not HTTP.

## Conventions / gotchas

- **OpenRouter for everything** — one API key, configure `FOCUS_MODEL` and `AGENT_MODEL` independently.
  Default focus model: `google/gemma-3-12b-it`. Default agent model: `anthropic/claude-sonnet-4-6`.
- **Deep-link encoding**: use `%20` for spaces, not `+`. iOS `URLComponents` does not decode `+`.
- **Info.plist + synchronized groups**: `Zenly/Info.plist` has a membership exception in the
  `.pbxproj` (`PBXFileSystemSynchronizedBuildFileExceptionSet`) so it isn't double-processed as a
  bundle resource. If you add another generated-then-merged plist, it needs the same exception.
- **imessage-kit requires Full Disk Access** — the SDK opens `~/Library/Messages/chat.db` at
  construction. Without FDA it throws `IMessageError(DATABASE)`. Server still boots; watcher and
  local sends are skipped.
- **SMS forwarding for non-iMessage contacts**: iPhone must be nearby with Settings → Messages →
  Text Message Forwarding → [Mac] enabled. For demo both sides can be iMessage.
- Keep secrets in `api/.env` (gitignored); never commit keys.
