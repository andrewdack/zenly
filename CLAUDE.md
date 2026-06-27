# Zenly

Intent-aware distraction blocker with a conversational iMessage agent.

**User flow:**
1. First launch: user configures intervention level (nudge / block / snitch) and accountability
   contact in the app. This is a one-time setup.
2. To start a session: user iMessages the agent (`4156055838`). The agent collects either a
   **task** (focus session, optional duration) **or** starts **guardian mode** (no task — just
   watching for self-destructive behavior). Agent replies with a deep link.
3. User taps the deep link → iOS app starts the session (task or guardian).
4. App captures screenshots (ReplayKit) and POSTs them to `/judge`. The vision model returns a
   status: `on_task` / `off_task` / `destructive` / `ok`. **Destructive** = doomscrolling, addictive
   games, gambling — flagged in any mode, even if technically "off task".
5. **Watchdog (grace window)**: first slip → agent texts a **check-in** ("hey, what's up?"); the user
   can reply to explain or own it. If they keep slipping past the grace window, Zenly **escalates**
   per the configured level: local notification (nudge) → ManagedSettings shield (block) → funny
   iMessage to the accountability contact (snitch). Behavior-driven — stopping resets the episode.

The check-in → escalation logic lives in `api/src/agent/watchdog.ts` (a pure reducer) and is
driven by `POST /judge`. Nudge/block are applied on-device; snitch is sent by the backend.

Hackathon project. macOS, Xcode 26.6, Node 24, iPhone target.

## Repo layout

```
Zenly.xcodeproj          # objectVersion 77 — uses PBXFileSystemSynchronizedRootGroup
Zenly/                   # main SwiftUI app target
ZenlyBroadcast/          # ReplayKit RPBroadcastSampleHandler (screen capture)  [App Groups]
ZenlyBroadcastSetupUI/   # ReplayKit setup UI extension                         [App Groups]
ZenlyActivity/           # DeviceActivityMonitor extension (shield)             [Family Controls — PAID ONLY]
ZenlyTests/ ZenlyUITests/
api/                     # canonical Node.js + Express + TypeScript server
```

## Build order & status

| Phase | What | Status |
|------|------|--------|
| 1 | Xcode scaffold: 4 targets, entitlements, App Group, URL scheme | ✅ done, builds clean |
| 2 | Node backend scaffold: Express + provider-agnostic LLM + routes + iMessage watcher | ✅ done, smoke-tested |
| 3 | iMessage agent conversation loop (stateful, `<session>` parsing, iMessage reply) | ✅ done — `api/src/agent/handler.ts`; local watcher + Photon/Spectrum both wired |
| 4 | SwiftUI: settings screen (intervention level + contact), waiting screen, active-session timer | ✅ done — `Zenly/ContentView.swift`; settings sheet on first launch, waiting screen, live `TimerRing`. Verified in sim. |
| 5 | ReplayKit broadcast: frame → JPEG → App Group container | ☐ todo |
| 6 | App polling loop: read frames → POST /judge → nudge/escalate | ◐ backend `/judge` + watchdog done (guardian/task, check-in, grace-window escalate); app frame loop todo |
| 7 | DeviceActivityMonitor: read shield instruction → ManagedSettingsStore | ☐ todo (PAID — Family Controls) |
| 8 | Snitch escalation → iMessage to accountability contact | ◐ auto-triggered by `/judge` watchdog on escalate (+ manual `/snitch`); app passes contactPhone at session start |
| 9 | Demo polish: shield text, summary message, stats dashboard | ☐ todo |

## iOS project facts

- **Bundle ID**: `andrew.Zenly` (Xcode-generated). For free provisioning it must be globally
  unique — likely change to `com.andrewhu.zenly`. Extensions inherit the prefix.
- **App Group**: `group.com.andrewh.zenly` — declared in all four targets' `.entitlements`.
  The constant lives in `Zenly/SessionStore.swift` (`AppGroup.identifier`).
- **User settings** live in `SessionStore`: `interventionLevel` (nudge/block/snitch enum) and
  `contactPhone` (string). Configured in the app on first launch; passed to `/snitch` by the app
  — the iMessage agent never collects the contact phone. **Persisted** to the App Group
  `UserDefaults` via `didSet` (loaded in `init`); `needsSetup` (true while `contactPhone` empty)
  drives the first-launch settings sheet. `InterventionLevel` carries `label` + `blurb` for the UI.
- **Phase 4 views** (`Zenly/ContentView.swift`): `SettingsView` (sheet — phone field + segmented
  level picker, "done" disabled until a contact is set), `WaitingView` ("text the agent" button
  opens `sms:MAC_IMESSAGE_HANDLE` via `openURL` — placeholder const, disabled while empty; shows a
  settings summary card), `ActiveSessionView` + `TimerRing` (`TimelineView(.periodic)` — counts
  down for timed sessions with a progress ring, counts elapsed up for indefinite; ring/label turn
  orange when off task). A **`#if DEBUG`** tap on the status label toggles `store.onTask` to preview
  the off-task UI until the Phase 6 judge drives it. UI text is all lowercase (gen-z tone).
- **Simulator run/verify** (no device needed for Phase 1–4): boot a sim, build for it, install +
  launch `andrew.Zenly`, then drive the deep link directly (Messages can't send from the sim, and
  `sms:` doesn't open there): `xcrun simctl openurl <sim> "zenly://session/start?task=...&duration=45"`.
  Firing the URL from outside the app shows an "Open in Zenly?" confirm; the in-Messages tap skips it.
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

TypeScript + Node + Express. **`api/` is the only server** (the old `backend/` reference
implementation has been removed).

**Agent number**: the Zenly agent runs on **Photon/Spectrum** at iMessage number
**`4156055838`** — this is what users text to start a session. It's hardcoded in the iOS app as
`MAC_IMESSAGE_HANDLE` in `Zenly/ContentView.swift` (the "text the agent" button opens
`sms:4156055838`). No local Mac is required for Photon mode.

**LLM**: everything goes through **OpenRouter** (OpenAI-compatible) — one `OPENROUTER_API_KEY`
covers both vision (focus judge) and agent chat. Model is configurable per role.

**Messaging** (dual-provider, same `MessageSender` interface):
- `photon` — cloud via `spectrum-ts` / Photon project credentials. No local Mac needed for sending.
- `local` — `@photon-ai/imessage-kit`, reads `~/Library/Messages/chat.db` + sends via AppleScript.
  Requires macOS + Full Disk Access. Auto-selected when Photon creds are absent.

**Receiving** (iMessage watcher):
- **Photon primary**: `src/index.ts` uses `spectrum-ts` async message loop — run this when Photon creds are set.
- **Local fallback**: `src/server.ts` uses `imessage-kit` `sdk.startWatching()` — auto-selected when no Photon creds. Requires Full Disk Access. Watcher failure is non-fatal; Express still boots.

**Image format**: multipart JPEG (`POST /isFocused`, field name `image`). ReplayKit frames are
converted `CMSampleBuffer → CVPixelBuffer → UIImage → JPEG Data` before upload.

```
api/src/index.ts                        # Photon entry: Spectrum message loop → agent
api/src/server.ts                       # Local entry: Express + imessage-kit watcher + agent
api/src/app.ts                          # createApp() — all routes, error handler, OpenAPI docs
api/src/openapi.ts                      # OpenAPI spec + Swagger UI
api/src/config.ts                       # env vars + getConfig()
api/src/types.ts                        # shared TS types (Session/mode, FocusStatus, Watch, etc.)
api/src/prompts.ts                      # agent + snitch + focus-judge (task/guardian) + check-in prompts
api/src/agent/handler.ts               # createAgentHandler() — stateful conversation loop (parses mode)
api/src/agent/watchdog.ts              # pure grace-window reducer: good→reset, slip→check-in→escalate
api/src/store/sessions.ts              # per-phone LIVE session + watch state (in-memory, ephemeral)
api/src/store/db.ts                    # better-sqlite3 singleton + migrations (durable store)
api/src/store/profile.ts              # users/memories/verdicts/events — name, prefs, behavior memory
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

# Local mode (imessage-kit — grant Full Disk Access to Terminal first):
npm run dev:api        # tsx watch src/server.ts  (port 3001 + iMessage watcher)

# Photon mode (PROJECT_ID + PROJECT_SECRET required):
npm run dev            # tsx watch src/index.ts   (Spectrum message loop only)
```

### Routes

| Method | Path | Body / purpose |
|--------|------|----------------|
| GET  | `/health`           | `{ ok: true }` |
| POST | `/isFocused`        | multipart: `image` (JPEG) + optional `task` → `{ status, isFocused, destructiveCategory, confidence, reason }` (stateless one-shot; mode = task if `task` given, else guardian) |
| POST | `/judge`            | **stateful** multipart: `image` + `userPhone` (+ optional `graceMs`) → judges with the user's session mode, runs the watchdog, sends check-in / snitch, returns `{ verdict, action, escalation, stats }`. Requires an active session. |
| POST | `/sendMessage`      | `{ to, message }` → send iMessage via configured provider |
| POST | `/session/start`    | `{ userPhone, task?, durationMinutes?, mode?, interventionLevel?, contactPhone? }` → session + deeplink (`mode: "guardian"` for no-task watching) |
| GET  | `/session/:phone`   | active session + stats + deeplink |
| POST | `/snitch`           | `{ task, contactPhone, screenContent, userPhone? }` → LLM-generated shame iMessage (manual trigger; `/judge` does this automatically on escalate) |

`action` from `/judge` is one of `none` / `checkin` / `waiting` / `escalate` (with `level`). The
app applies nudge/block locally from `action`; snitch is sent server-side.

Inbound messages arrive via the local iMessage watcher, not HTTP.

## User identity & memory (SQLite)

Durable per-user data lives in SQLite (`api/data/zenly.db`, gitignored) via `store/db.ts` +
`store/profile.ts`. The live `session`/`watch` state stays in the in-memory Map (`store/sessions.ts`).

- **Tables**: `users(phone, name, prefs_json)`, `memories(phone, kind, fact)`,
  `verdicts(phone, status, category, reason, mode)`, `events(phone, type, detail)`.
- **Identity (both inputs)**: the agent asks the user's name on first contact and stores it via a
  hidden `<profile>{"name":"…"}` block; the app also has a "your name" field sent up at
  `/session/start`. Both reconcile in the `users` row (keyed by phone). The agent injects the known
  name + recent memories into its system prompt.
- **Phone identity**: `startLink()` embeds `&phone=<from>` so the app learns its own number
  (`SessionStore.userPhone`) — required for the app to call `/judge`.
- **Memory building (planned: phase C)**: `/judge` already logs every verdict + event; an LLM
  "profiler" will distill these into `memories`. Explicit prefs come from the app + agent.
- **DB override**: set `ZENLY_DB_PATH` (`:memory:` in tests).

## ReplayKit → Messages: full data flow & what's left

The end-to-end loop and its current state:

```
ReplayKit broadcast ──✅──> latest_frame.jpg in App Group  (ZenlyBroadcast/SampleHandler.swift, ~1fps)
   app starts broadcast ──❌──  no RPSystemBroadcastPickerView yet
   app reads frame + uploads ──❌──  no API client / frame loop yet
POST /judge ──✅──> watchdog ──✅──> check-in / snitch via Photon ──✅──> user's Messages
   app applies nudge/block from `action` ──❌──  no on-device handling yet
```

Remaining work to close the loop (all app-side; the backend is done & testable via curl):

1. **Start the broadcast** — add `RPSystemBroadcastPickerView` (preferredExtension = ZenlyBroadcast)
   on the running-session screen so the user begins screen capture when the session starts.
2. **Carry the user's identity in the deeplink** — `/judge` keys sessions by `userPhone`, but the app
   has no way to know the user's own number. The agent knows `from`, so `startLink()` must append
   `&phone=<from>` (or a `sid` token); `SessionStore.handle(url:)` parses + stores it. **Blocking** —
   without this the app can't tell `/judge` who it is.
3. **API client** — `URLSession` layer + a base-URL config (Mac LAN IP for demo, or a deployed
   `api/` URL). Add an `API_BASE_URL` constant next to `MAC_IMESSAGE_HANDLE`.
4. **Frame loop (Phase 6)** — timer (every ~3–5s while a session is active) reads `latest_frame.jpg`
   from the App Group, multipart-POSTs it to `/judge` with `userPhone`, decodes `{ verdict, action }`.
5. **Apply the result on-device** — set `store.onTask` from `verdict.status` (live UI), and on
   `action.type == "escalate"`: `nudge` → local `UNUserNotification` (request permission first);
   `block` → ManagedSettings shield (Phase 7, **PAID**); `snitch` → already sent by backend.
6. **Infra** — phone must reach the `api/` base URL (same Wi-Fi as the Mac, or deploy); Photon
   allowlist must include the user's number + the contact; ReplayKit needs a **physical device**
   (the simulator can't broadcast).

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
