import type { PhoneState, ParsedSession, Session } from "../types.js";

const store = new Map<string, PhoneState>();

function init(phone: string): PhoneState {
  if (!store.has(phone)) {
    store.set(phone, { phone, history: [], session: null, stats: { nudges: 0, snitches: 0, lastOnTask: true } });
  }
  return store.get(phone)!;
}

export function get(phone: string): PhoneState { return init(phone); }

export function appendTurn(phone: string, role: "user" | "assistant", content: string) {
  const state = init(phone);
  state.history.push({ role, content });
  if (state.history.length > 40) state.history.splice(0, 2);
}

export function startSession(phone: string, parsed: ParsedSession): Session {
  const state = init(phone);
  const session: Session = { task: parsed.task, durationMinutes: parsed.durationMinutes, startedAt: Date.now() };
  state.session = session;
  return session;
}

export function getSession(phone: string): Session | null {
  return store.get(phone)?.session ?? null;
}

export function recordNudge(phone: string) { init(phone).stats.nudges++; }
export function recordSnitch(phone: string) { init(phone).stats.snitches++; }
export function recordFocusVerdict(phone: string, onTask: boolean) { init(phone).stats.lastOnTask = onTask; }

export function statsSummary(phone: string): string {
  const { session, stats } = init(phone);
  if (!session) return "no active session";
  const elapsed = Math.round((Date.now() - session.startedAt) / 60000);
  const limit = session.durationMinutes != null ? `/${session.durationMinutes}` : " (no time limit)";
  return `task: "${session.task}" | ${elapsed}${limit} min elapsed | nudges: ${stats.nudges} | snitches: ${stats.snitches} | last check: ${stats.lastOnTask ? "on task" : "off task"}`;
}
