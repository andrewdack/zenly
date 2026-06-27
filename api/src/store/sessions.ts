import type { FocusStatus, PhoneState, ParsedSession, Session } from "../types.js";
import { freshWatch } from "../types.js";
import { step, type WatchdogAction, type WatchdogConfig } from "../agent/watchdog.js";

const store = new Map<string, PhoneState>();

function init(phone: string): PhoneState {
  if (!store.has(phone)) {
    store.set(phone, {
      phone,
      history: [],
      session: null,
      watch: freshWatch(),
      stats: { nudges: 0, snitches: 0, checkIns: 0, lastStatus: "ok" }
    });
  }
  return store.get(phone)!;
}

export function get(phone: string): PhoneState { return init(phone); }

export function appendTurn(phone: string, role: "user" | "assistant", content: string) {
  const state = init(phone);
  state.history.push({ role, content });
  if (state.history.length > 40) state.history.splice(0, 2);
}

export interface StartSessionOptions {
  interventionLevel?: Session["interventionLevel"];
  contactPhone?: string | null;
}

export function startSession(phone: string, parsed: ParsedSession, opts: StartSessionOptions = {}): Session {
  const state = init(phone);
  const session: Session = {
    mode: parsed.mode,
    task: parsed.task,
    durationMinutes: parsed.durationMinutes,
    startedAt: Date.now(),
    interventionLevel: opts.interventionLevel ?? "nudge",
    contactPhone: opts.contactPhone ?? null
  };
  state.session = session;
  state.watch = freshWatch();
  return session;
}

export function getSession(phone: string): Session | null {
  return store.get(phone)?.session ?? null;
}

export function endSession(phone: string) {
  const state = init(phone);
  state.session = null;
  state.watch = freshWatch();
}

/** Run a fresh judge verdict through the watchdog, updating state, and return the action. */
export function recordVerdict(
  phone: string,
  status: FocusStatus,
  reason: string,
  now: number = Date.now(),
  config?: WatchdogConfig
): WatchdogAction {
  const state = init(phone);
  state.stats.lastStatus = status;
  if (!state.session) return { type: "none" };

  const { watch, action } = step(state.watch, state.session, status, reason, now, config);
  state.watch = watch;
  if (action.type === "checkin") state.stats.checkIns++;
  return action;
}

export function recordNudge(phone: string) { init(phone).stats.nudges++; }
export function recordSnitch(phone: string) { init(phone).stats.snitches++; }

export function statsSummary(phone: string): string {
  const { session, stats } = init(phone);
  if (!session) return "no active session";
  const elapsed = Math.round((Date.now() - session.startedAt) / 60000);
  const what = session.mode === "guardian"
    ? "guardian mode (no task)"
    : `task: "${session.task}"`;
  const limit = session.durationMinutes != null ? ` | ${elapsed}/${session.durationMinutes} min` : ` | ${elapsed} min (no limit)`;
  return `${what}${limit} | check-ins: ${stats.checkIns} | nudges: ${stats.nudges} | snitches: ${stats.snitches} | last check: ${stats.lastStatus}`;
}
