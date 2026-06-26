import type { PhoneState, Session, ParsedSession } from "../types.js";

const byPhone = new Map<string, PhoneState>();

function blank(phone: string): PhoneState {
  return { phone, history: [], session: null, stats: { nudges: 0, snitches: 0, lastOnTask: true } };
}

export function get(phone: string): PhoneState {
  if (!byPhone.has(phone)) byPhone.set(phone, blank(phone));
  return byPhone.get(phone)!;
}

export function appendTurn(phone: string, role: "user" | "assistant", content: string): void {
  get(phone).history.push({ role, content });
}

export function startSession(phone: string, { task, durationMinutes }: ParsedSession): Session {
  const state = get(phone);
  state.session = { task, durationMinutes, startedAt: Date.now() };
  state.stats = { nudges: 0, snitches: 0, lastOnTask: true };
  return state.session;
}

export function getSession(phone: string): Session | null {
  return get(phone).session;
}

export function recordNudge(phone: string): void {
  get(phone).stats.nudges += 1;
}

export function recordSnitch(phone: string): void {
  get(phone).stats.snitches += 1;
}

export function statsSummary(phone: string): string {
  const state = get(phone);
  if (!state.session) return "You don't have an active session right now.";
  const elapsedMin = Math.floor((Date.now() - state.session.startedAt) / 60000);
  const timeStr = state.session.durationMinutes != null
    ? `~${Math.max(0, state.session.durationMinutes - elapsedMin)} min left`
    : "no time limit";
  return `Task: ${state.session.task}. ${elapsedMin} min in, ${timeStr}. Nudges: ${state.stats.nudges}, snitches: ${state.stats.snitches}.`;
}
