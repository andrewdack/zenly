# Zenly

Intent-aware distraction blocker with a conversational SMS agent. A user texts a Twilio
number, an LLM agent collects their task/duration/accountability-contact and starts a focus
session in the iOS app. The app captures screenshots (ReplayKit), a backend vision model judges
"on task" vs "off task", and escalation goes: local notification → ManagedSettings shield →
funny SMS to the accountability contact.

Hackathon project. macOS, Xcode 26.6, Node 24, iPhone target.

## Repo layout

```
Zenly.xcodeproj          # objectVersion 77 — uses PBXFileSystemSynchronizedRootGroup
Zenly/                   # main SwiftUI app target
ZenlyBroadcast/          # ReplayKit RPBroadcastSampleHandler (screen capture)  [App Groups]
ZenlyBroadcastSetupUI/   # ReplayKit setup UI extension                         [App Groups]
ZenlyActivity/           # DeviceActivityMonitor extension (shield)             [Family Controls — PAID ONLY]
ZenlyTests/ ZenlyUITests/
backend/                 # Node.js + Express: SMS agent, vision judge, snitch
```

## Build order & status

| Phase | What | Status |
|------|------|--------|
| 1 | Xcode scaffold: 4 targets, entitlements, App Group, URL scheme | ✅ done, builds clean |
| 2 | Node backend scaffold: Express + provider-agnostic LLM + 3 routes + echo webhook | ✅ done, smoke-tested |
| 3 | SMS agent conversation loop (stateful, `<session>` parsing, Twilio reply) | ◐ built in `backend/src/routes/sms.js`; activates when an LLM key is set |
| 4 | SwiftUI: waiting screen, active-session timer + status, stats | ◐ waiting + basic active screen exist (`ContentView.swift`); timer/stats TODO |
| 5 | ReplayKit broadcast: frame → JPEG → App Group container | ☐ todo |
| 6 | App polling loop: read frames → POST /judge → nudge/escalate | ☐ todo |
| 7 | DeviceActivityMonitor: read shield instruction → ManagedSettingsStore | ☐ todo (PAID — Family Controls) |
| 8 | Snitch escalation → POST /snitch → Twilio | ◐ `/snitch` route done; app trigger todo |
| 9 | Demo polish: shield text, summary SMS, stats dashboard | ☐ todo |

## iOS project facts

- **Bundle ID**: `andrew.Zenly` (Xcode-generated). For free provisioning it must be globally
  unique — likely change to `com.andrewhu.zenly`. Extensions inherit the prefix.
- **App Group**: `group.com.andrewh.zenly` — declared in all four targets' `.entitlements`.
  The constant lives in `Zenly/SessionStore.swift` (`AppGroup.identifier`).
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

## Backend

Node + Express in `backend/`. **Provider-agnostic LLM layer** — Claude (Anthropic) by default,
OpenAI by flipping `LLM_PROVIDER`. Neither vendor is hard-wired.

```
src/index.js              # express app, route mounting, health
src/config.js             # env + provider/twilio "configured?" helpers
src/llm/index.js          # getLLM() factory keyed on LLM_PROVIDER
src/llm/anthropic.js      # chat()+vision() via @anthropic-ai/sdk (default model claude-sonnet-4-6)
src/llm/openai.js         # chat()+vision() via openai (default model gpt-4o)
src/prompts.js            # agent / judge / snitch system prompts
src/store/sessions.js     # in-memory state per phone (history, session, stats)
src/services/twilio.js    # sendSMS() + twiml() reply builder
src/util/deeplink.js      # startLink() — encodes spaces as %20 (NOT "+", which iOS won't decode)
src/routes/sms.js         # POST /webhook/sms — agent loop, or echo if no LLM key
src/routes/judge.js       # POST /judge — vision verdict
src/routes/snitch.js      # POST /snitch — funny shame SMS
src/routes/session.js     # POST /session/start, GET /session/:phone
```

**LLM interface** (both providers implement identically — add a vendor = one file + one registry line):
- `chat({ system, messages, maxTokens }) -> Promise<string>`
- `vision({ system, prompt, imageBase64, mediaType, maxTokens }) -> Promise<string>`

**Degraded mode** (no keys): server boots and every route responds — `/webhook/sms` echoes,
`/judge` returns `on_task:true`, `/snitch` uses a canned message and logs instead of sending.

### Run

```bash
cd backend
npm install
cp .env.example .env     # add ANTHROPIC_API_KEY (or set LLM_PROVIDER=openai + OPENAI_API_KEY)
npm run dev              # node --watch; or: npm start
```

### Routes

| Method | Path | Body / purpose |
|--------|------|----------------|
| GET  | `/`               | health + config status |
| POST | `/webhook/sms`    | Twilio form post → agent reply (TwiML) or echo |
| POST | `/judge`          | `{ task, imageBase64, mediaType? }` → `{ on_task, confidence, reason }` |
| POST | `/snitch`         | `{ task, contactPhone, screenContent, userPhone? }` → SMS to contact |
| POST | `/session/start`  | `{ userPhone, task, durationMinutes, contactPhone }` → session + deeplink |
| GET  | `/session/:phone` | polling handoff for the app |

### Twilio (set up when ready)

Buy a number → set Messaging "A message comes in" webhook to
`https://<ngrok-or-host>/webhook/sms` (POST). `ngrok http 3000` to expose localhost. Put
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` in `.env` (only needed for the
outbound snitch; inbound replies use TwiML, no creds).

## Conventions / gotchas

- **LLM provider is swappable** — keep new model calls behind `getLLM()`; don't import a vendor SDK
  directly in routes. Default model is `claude-sonnet-4-6` (set per spec; `claude-opus-4-8` is the
  current most-capable if you want the agent sharper).
- **Deep-link encoding**: use `%20` for spaces, not `+`. iOS `URLComponents` does not decode `+`.
- **Info.plist + synchronized groups**: `Zenly/Info.plist` has a membership exception in the
  `.pbxproj` (`PBXFileSystemSynchronizedBuildFileExceptionSet`) so it isn't double-processed as a
  bundle resource. If you add another generated-then-merged plist, it needs the same exception.
- Keep secrets in `backend/.env` (gitignored); never commit keys.
```
