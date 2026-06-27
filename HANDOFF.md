# Zenly — Handoff

_Last updated: 2026-06-27_

## Status: primary feature is WORKING ✅

The core loop runs end-to-end on a physical device:

1. User texts the agent → agent replies with a `zenly://` deep link.
2. Tapping the link starts the focus session and the ReplayKit broadcast.
3. The **broadcast extension** captures frames and uploads them to `POST /judge`
   every ~4s (works in the background, even while the user is in another app).
4. The vision model (now `anthropic/claude-haiku-4-5` at `detail: "high"`) judges
   on-task / off-task / destructive.
5. On a check-in / escalate verdict, the server sends a real iMessage to the user.

Both backend processes must be running for a demo:

```bash
cd api
npx tsx src/server.ts   # HTTP API + /judge        (no `tsx watch` — see tech debt)
npx tsx src/index.ts    # Photon agent (inbound texts)   [Photon mode only]
```

## ⚠️ Tech debt — in-memory session store

Sessions live **only in memory** (`api/src/store/sessions.ts`, a `Map`). Consequences:

- **Any server restart wipes all active sessions.** The app keeps polling and
  `POST /judge` then returns **409 `no_active_session`** until the session is
  recreated. Recreate with:
  ```bash
  curl -s -X POST http://<MAC_IP>:3001/session/start \
    -H "Content-Type: application/json" \
    -d '{"userPhone":"<phone>","mode":"guardian","interventionLevel":"nudge"}'
  ```
- **`tsx watch` restarts on every file save**, silently wiping the session
  mid-session. For demos run **without watch** (`npx tsx src/server.ts`).
- **Fix later:** persist sessions in the existing SQLite store
  (`api/src/store/db.ts` / `data/zenly.db`) so they survive restarts, or at least
  rehydrate from the DB on boot.

## Environment constraint

**No Xcode on this machine — iOS sims cannot be run here.** All Swift changes are
build-only / unverified locally. iOS tasks below must be compiled and tested on a
machine with Xcode + a physical device (ReplayKit screen capture and the shield
need a real device; the shield also needs a paid Apple account).

---

## TODO (handoff tasks)

### 1. Implement the snitch feature
**Goal:** when the user keeps slipping, text their accountability buddy.

**Why it doesn't fire today:**
- The `/judge` escalate→snitch branch only runs when the **session** has
  `interventionLevel: "snitch"` **and** a non-null `contactPhone`
  (`api/src/app.ts`, the `/judge` handler).
- The iOS app holds `interventionLevel` + `contactPhone` in `SessionStore`, but
  **never sends them to the backend** — `ZenlyAPIClient` has no `/session/start`
  or settings call. So every backend session is `nudge` + `contactPhone: null`.
- Photon only delivers to **verified/allowlisted targets**, so the buddy number
  must be a **verified Photon user** (the E.164 normalization in
  `photonMessenger.ts` is already in place).

**Implementation:**
1. Add a method to `ZenlyAPIClient` that POSTs `userPhone`, `interventionLevel`,
   and `contactPhone` to `/session/start` (the route already accepts these —
   `api/src/app.ts:135`). Call it from `SessionStore.start()` (or on deep-link
   open) so the backend session carries the real level + contact.
2. Use a **verified Photon number** as the demo accountability contact.
3. Verify: go off-task → check-in → wait out the grace window (60s, see
   `watchdog.ts` `DEFAULT_WATCHDOG.graceMs`) → still off-task → `generateSnitchText`
   sends to `contactPhone`. The `/snitch` route also exists for a manual trigger.
4. Optional: lower `graceMs` for a snappier demo (the `/judge` route already reads
   an optional `graceMs` form field).

### 2. End button should actually end the session
**Current:** `Button("end") { store.end() }` (`ContentView.swift:349`) is wired,
and `SessionStore.end()` does stop the judge loop, call `POST /session/end`, and
clear local state. **But the ReplayKit broadcast keeps recording**, so the
extension keeps POSTing frames to `/judge` (which now 409s, or re-judges a stale
session).

**Implementation:**
- The broadcast can't be stopped programmatically from the app (it's system-owned
  via `RPSystemBroadcastPickerView`). So on end, **signal the extension to stop
  uploading**: in `SessionStore.end()`, clear the App Group `userPhone` (or write a
  `sessionActive = false` flag) that `ZenlyBroadcast/SampleHandler.swift` checks
  before each upload — it already early-returns when `userPhone` is empty.
- Prompt the user to stop the broadcast via the system UI (or the broadcast picker),
  and ideally `broadcastFinished()` already removes the stale frame.
- Verify the backend session is gone (`GET /session/:phone` → inactive) and no more
  `/judge` calls arrive after tapping end.

### 3. Remove the local push-notification banner
**Why:** the server-side **iMessage already notifies** the user, so the on-device
local notification is redundant (and is often suppressed during screen recording
anyway).

**Implementation — undo the local-notification feature:**
- `ZenlyBroadcast/SampleHandler.swift`: remove `postOffTaskNotification(...)` and the
  response-parsing block that calls it; drop the `import UserNotifications` and the
  `JudgeResult` decode if nothing else needs it (the upload itself stays).
- `Zenly/ZenlyApp.swift`: remove the `UNUserNotificationCenter.requestAuthorization`
  `.task` block (and `import UserNotifications`).
- Leave `SessionStore.sendLocalNudge` decision to taste — it never fires in the
  background anyway, so it can also be removed.

### 4. Fix app formatting — text is cut off
**Cause:** the Redaction display font is wide, and several views use **fixed
heights + `lineLimit`** that clip text:
- `ContentView.swift:113` `minHeight: 132`, `:258` `minHeight: 64`,
  `:324` `minHeight: 104`, `:428` `.lineLimit(3)`, plus `.frame(maxWidth: 320)`
  caps on labels.

**Implementation:**
- Replace fixed `minHeight` frames around text with content-driven sizing, or add
  `.fixedSize(horizontal: false, vertical: true)` so text wraps and grows.
- Remove / raise `.lineLimit(3)` where verdict reasons get clipped, or add
  `.minimumScaleFactor(0.7)` for single-line labels that must fit.
- Re-check the active-session card, settings summary rows, and the profile/stats
  views at the smallest target device width.
- Must be verified in the simulator/device (no Xcode here).

---

## Quick reference

- App ↔ API base URL is **hardcoded**: `Zenly/ContentView.swift:10`
  (`http://192.168.7.29:3001`) and `ZenlyBroadcast/SampleHandler.swift`
  (`judgeURL`). Update **both** if the Mac's IP changes.
- App Group: `group.com.andrewh.zenly`; `userPhone` key is written by
  `SessionStore` and read by the broadcast extension.
- Models via OpenRouter: `FOCUS_MODEL` (vision), `AGENT_MODEL`, `SNITCH_MODEL` —
  all overridable in `api/.env`.
