# Plan — judging accuracy, escalation, sampling

_For the next agent. Scope: backend `api/` + the two Swift sampling intervals._

## Environment / constraints
- **No iOS simulator runs here** — compile only. Build check:
  `xcodebuild -project Zenly.xcodeproj -scheme Zenly -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -configuration Debug build CODE_SIGNING_ALLOWED=NO`
- Backend is fully testable with `curl` (see verification per task). Run it with
  `cd api && npx tsx src/server.ts` (no `tsx watch` — saves wipe in-memory sessions).
- After backend edits, **restart the server** (it reads config/code at boot).

---

## Task 1 — Fix task-mode judging (`api/src/prompts.ts`)

**Problem:** In task mode the judge is too lenient. Clear distractions unrelated to
the task (TikTok, video games, gambling, streaming) are NOT flagged because the
rubric excuses "intentional content." Separately, neutral/utility surfaces
(Settings, Screen Time, Spotify, email, Messages, Maps) get treated
inconsistently — they should **never** be flagged even though they aren't the task.

**Root cause:** The `DESTRUCTIVE_RUBRIC`'s "intentional content vs mindless
scrolling" carve-out leaks into the *task-relevance* decision. "Intentional" should
only ever affect the **guardian-mode destructive** call, never task off-task
detection. There is also no concept of a neutral/utility allowlist.

**Fix — restructure `focusJudgeSystem` (the `task` branch) around a strict decision
order.** Make the model evaluate in this priority:

1. **NEUTRAL / utility / transient surfaces → `on_task`** (never flag). Explicit
   allowlist to bake into the prompt: home screen, lock screen, app switcher,
   Settings, Screen Time / Digital Wellbeing, Control Center, notifications,
   system dialogs/permission prompts, **Spotify / Apple Music / any music player**,
   **email**, **Messages / iMessage / SMS**, Phone, Maps, Calendar, Clock,
   Calculator, Files, Camera, Wallet, Weather, a loading/blank/black screen, or no
   clear screen. Rationale: these are short, neutral glances — flagging them is
   noise. (Apply the same allowlist to guardian mode → `ok`.)
2. **Clearly relates to the task → `on_task`.**
3. **Clear distraction → `off_task` (or `destructive`)** — short-form video feeds
   (TikTok / Reels / Shorts), social-feed scrolling, video games, gambling/betting,
   streaming video/Netflix/YouTube watching, or any entertainment **unrelated to the
   task**. **"Intentional" does NOT excuse this** — deliberately watching TikTok
   during a research task is still off task. Use `destructive` for the
   addictive-feed/gambling categories, `off_task` for other unrelated entertainment.
4. **Unrelated but work-shaped** (a different work app/doc not matching the task) →
   `off_task`.
5. **Genuinely ambiguous / can't tell** → `on_task` (stay lenient only here).

**Implementation notes:**
- Keep the JSON schema/enum unchanged (`on_task | off_task | destructive` for task
  mode; `ok | destructive` for guardian). Neutral apps just return `on_task`/`ok`.
- **Rewrite the "intentional content" line** in `DESTRUCTIVE_RUBRIC` so it only
  governs the doomscroll-vs-deliberate distinction *within already-distracting
  apps*; it must not be a blanket "if intentional, it's fine." Guardian mode must
  still catch doomscrolling, so don't gut the rubric — just stop it from leaking
  into task relevance.
- Remove/soften the current "when uncertain, prefer on_task" only as it applies to
  obvious entertainment — keep leniency for genuine work ambiguity (step 5).
- The watchdog already treats `off_task` and `destructive` as "bad"
  (`agent/watchdog.ts` `isBad`), so correct classification is the whole fix here.

**Verify:** `POST /isFocused` (multipart `image` + `task` field) against sample
frames — a TikTok screenshot with `task="scholarship research"` must come back
`off_task`/`destructive`; a Settings or Spotify screenshot must come back `on_task`.

---

## Task 2 — Snitch after 3 check-ins in a short window (`api/src/agent/watchdog.ts` + `src/types.ts`)

**Current:** `step()` sends ONE check-in on the first bad verdict, waits out a
60s grace window, then escalates once. The user wants: keep pinging on sustained/
repeated off-task, and **escalate (snitch) once 3 check-ins land within a short
window.**

**Design:**
- Add `checkInTimes: number[]` to the `Watch` interface (`types.ts`) and to
  `freshWatch()`. The `strikes`/`graceUntil` fields can be retired or repurposed.
- New `WatchdogConfig`: `{ checkInCooldownMs: 30_000, windowMs: 300_000, snitchAfter: 3 }`.
  **Use 30s cooldown — the demo wants this punchy** (3 check-ins ≈ ~90s of sustained
  off-task before the snitch fires). Replace `DEFAULT_WATCHDOG.graceMs`.
- Rewrite `step()`:
  1. Good verdict → `freshWatch()`, action `none`.
  2. Bad verdict → prune `checkInTimes` older than `windowMs`.
  3. If it's been ≥ `checkInCooldownMs` since the last check-in (or none yet) →
     emit `checkin`, push `now` to `checkInTimes`.
  4. After recording, if `checkInTimes.length >= snitchAfter` and not already
     escalated → emit `escalate` (level = `session.interventionLevel`), set
     `escalated`, and clear `checkInTimes` so it doesn't immediately re-fire.
  5. Otherwise → `waiting`.
- This re-pings every ~30s while the user stays off task, snitching after the 3rd
  ping (~90s sustained), and also counts repeat in-and-out episodes within the
  window. Keep `escalated` as a fire-once guard; let a good verdict reset it.
- Update `stats.checkIns` on each check-in (already happens in
  `store/sessions.ts recordVerdict`; keep it consistent).
- The `/judge` route (`app.ts`) reads a `graceMs` form field — update it to the new
  config knobs or just drop it and use config defaults.

**Note:** escalation only actually snitches when the session is
`interventionLevel: "snitch"` with a `contactPhone` (set from the app now). For the
demo that contact must be a **verified Photon number**.

**Verify:** drive `POST /judge` repeatedly with an off-task frame (or unit-test
`step()` directly — see existing tests). Confirm 3 check-ins → one escalate, and a
good verdict in between resets.

---

## Task 3 — Sample every 10 seconds (Swift)

- `ZenlyBroadcast/SampleHandler.swift:26` → `uploadInterval = 10.0` (was 4.0).
- `Zenly/SessionStore.swift:72` → `judgeIntervalNanoseconds = 10_000_000_000`
  (was 5s) — **only relevant if the main-app loop survives Task 4**; if the loop is
  removed, this is moot.
- Bonus: at 10s the vision cost drops ~2.5× vs 4s. Make sure the new watchdog
  timings (Task 2) make sense at a 10s cadence (they're wall-clock, so they do).

---

## Task 4 — Other issues to fix

### 4a. Double-judging (now a correctness bug, not just cost) — **do this with Task 2**
Both the **broadcast extension** (`SampleHandler`) and the **main-app loop**
(`SessionStore.judgeLatestFrameIfReady`) POST to `/judge`. In the foreground that's
2× verdicts feeding the watchdog — which will **double-count check-ins** and mis-fire
the new 3-check-in snitch. Pick **one** uploader:
- Recommended: make the **extension the sole judge**; remove the upload from
  `judgeLatestFrameIfReady`. For the foreground status card, have the app poll the
  lightweight `GET /session/:phone` (already returns `stats` + `lastStatus`; add
  `lastReason` if needed) instead of uploading its own frame.

### 4b. Hardcoded API IP in two places
`Zenly/ContentView.swift:10` (`API_BASE_URL`) and
`ZenlyBroadcast/SampleHandler.swift:21` (`judgeURL`) both hardcode
`http://192.168.7.29:3001`. Either write the base URL into the App Group from the
app (single source) or at minimum document that both must change together when the
Mac IP changes.

### 4c. Session resilience on server restart (optional)
The app now POSTs `/session/start` on deep-link open, so cold 409s are mostly gone —
but a mid-session server restart drops the in-memory session and the app won't
re-sync until the next `start()`. Optional hardening: when `/judge` returns **409**,
have `SessionStore` re-call `startSession(...)` once, then continue. (Durable fix
remains: persist sessions to the existing SQLite store — see HANDOFF.md tech debt.)

### 4d. Re-check guardian mode after the prompt rewrite
The neutral allowlist and rubric edits touch the shared `DESTRUCTIVE_RUBRIC`.
Confirm guardian mode still flags doomscrolling/gambling as `destructive` and
returns `ok` for the neutral allowlist.

---

## Suggested order
1. Task 3 (trivial, 2 constants).
2. Task 1 (prompt) — highest user-visible impact.
3. Task 4a (single uploader) — **before** Task 2, or the check-in count is wrong.
4. Task 2 (3-check-in snitch).
5. Task 4b/4c/4d cleanup.

Commit each task separately. No co-author line. Build-check after Swift edits;
`curl`-verify after backend edits.
