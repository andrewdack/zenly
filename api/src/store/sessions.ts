import type { ChatMessage, FocusStatus, PhoneState, ParsedSession, Session, Stats, Watch } from "../types.js";
import { freshWatch } from "../types.js";
import { step, type WatchdogAction, type WatchdogConfig } from "../agent/watchdog.js";
import { getDb } from "./db.js";

const store = new Map<string, PhoneState>();

const FOCUS_STATUSES: FocusStatus[] = ["on_task", "off_task", "destructive", "ok"];
const INTERVENTION_LEVELS: Session["interventionLevel"][] = ["nudge", "snitch"];

function freshState(phone: string): PhoneState {
  return {
    phone,
    history: [],
    session: null,
    watch: freshWatch(),
    stats: { nudges: 0, snitches: 0, checkIns: 0, lastStatus: "ok" }
  };
}

function init(phone: string): PhoneState {
  const existing = store.get(phone);
  if (existing) return existing;

  const persisted = loadLiveState(phone);
  const state = persisted ?? freshState(phone);
  store.set(phone, state);
  return state;
}

export function get(phone: string): PhoneState { return init(phone); }

export function appendTurn(phone: string, role: "user" | "assistant", content: string) {
  const state = init(phone);
  state.history.push({ role, content });
  if (state.history.length > 40) state.history.splice(0, state.history.length - 40);
  persistLiveState(state);
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
  persistLiveState(state);
  return session;
}

export function getSession(phone: string): Session | null {
  return init(phone).session;
}

export function endSession(phone: string) {
  const state = init(phone);
  state.session = null;
  state.watch = freshWatch();
  deleteLiveState(phone);
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
  persistLiveState(state);
  return action;
}

export function recordNudge(phone: string) {
  const state = init(phone);
  state.stats.nudges++;
  persistLiveState(state);
}

export function recordSnitch(phone: string) {
  const state = init(phone);
  state.stats.snitches++;
  persistLiveState(state);
}

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

/** Test helper: simulate a server restart without deleting durable SQLite state. */
export function resetForTests() {
  store.clear();
}

interface LiveSessionRow {
  session_json: string;
  watch_json: string;
  stats_json: string;
  history_json: string;
}

function loadLiveState(phone: string): PhoneState | null {
  const row = getDb()
    .prepare(`SELECT session_json, watch_json, stats_json, history_json FROM live_sessions WHERE phone = ?`)
    .get(phone) as LiveSessionRow | undefined;
  if (!row) return null;

  const session = normalizeSession(parseJson(row.session_json));
  if (!session) {
    deleteLiveState(phone);
    return null;
  }

  return {
    phone,
    session,
    watch: normalizeWatch(parseJson(row.watch_json)),
    stats: normalizeStats(parseJson(row.stats_json)),
    history: normalizeHistory(parseJson(row.history_json))
  };
}

function persistLiveState(state: PhoneState) {
  if (!state.session) {
    deleteLiveState(state.phone);
    return;
  }

  getDb().prepare(
    `INSERT INTO live_sessions (phone, session_json, watch_json, stats_json, history_json, updated_at)
     VALUES (@phone, @sessionJson, @watchJson, @statsJson, @historyJson, @updatedAt)
     ON CONFLICT(phone) DO UPDATE SET
       session_json = @sessionJson,
       watch_json = @watchJson,
       stats_json = @statsJson,
       history_json = @historyJson,
       updated_at = @updatedAt`
  ).run({
    phone: state.phone,
    sessionJson: JSON.stringify(state.session),
    watchJson: JSON.stringify(state.watch),
    statsJson: JSON.stringify(state.stats),
    historyJson: JSON.stringify(state.history.slice(-40)),
    updatedAt: Date.now()
  });
}

function deleteLiveState(phone: string) {
  getDb().prepare(`DELETE FROM live_sessions WHERE phone = ?`).run(phone);
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullablePositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeSession(value: unknown): Session | null {
  if (!isRecord(value)) return null;

  const mode = value.mode === "guardian" ? "guardian" : value.mode === "task" ? "task" : null;
  if (!mode) return null;

  const startedAt = typeof value.startedAt === "number" && Number.isFinite(value.startedAt)
    ? value.startedAt
    : null;
  if (startedAt == null) return null;

  const interventionLevel = INTERVENTION_LEVELS.includes(value.interventionLevel as Session["interventionLevel"])
    ? (value.interventionLevel as Session["interventionLevel"])
    : "nudge";

  return {
    mode,
    task: mode === "guardian" ? null : asNullableString(value.task) ?? "Focus session",
    durationMinutes: mode === "guardian" ? null : asNullablePositiveInt(value.durationMinutes),
    startedAt,
    interventionLevel,
    contactPhone: asNullableString(value.contactPhone)
  };
}

function normalizeWatch(value: unknown): Watch {
  if (!isRecord(value)) return freshWatch();
  const fallback = freshWatch();
  return {
    strikes: typeof value.strikes === "number" && Number.isFinite(value.strikes) ? Math.max(0, Math.floor(value.strikes)) : fallback.strikes,
    lastStatus: FOCUS_STATUSES.includes(value.lastStatus as FocusStatus) ? (value.lastStatus as FocusStatus) : fallback.lastStatus,
    checkInSentAt: typeof value.checkInSentAt === "number" && Number.isFinite(value.checkInSentAt) ? value.checkInSentAt : null,
    graceUntil: typeof value.graceUntil === "number" && Number.isFinite(value.graceUntil) ? value.graceUntil : null,
    escalated: typeof value.escalated === "boolean" ? value.escalated : fallback.escalated
  };
}

function normalizeStats(value: unknown): Stats {
  const fallback: Stats = { nudges: 0, snitches: 0, checkIns: 0, lastStatus: "ok" };
  if (!isRecord(value)) return fallback;
  return {
    nudges: typeof value.nudges === "number" && Number.isFinite(value.nudges) ? Math.max(0, Math.floor(value.nudges)) : fallback.nudges,
    snitches: typeof value.snitches === "number" && Number.isFinite(value.snitches) ? Math.max(0, Math.floor(value.snitches)) : fallback.snitches,
    checkIns: typeof value.checkIns === "number" && Number.isFinite(value.checkIns) ? Math.max(0, Math.floor(value.checkIns)) : fallback.checkIns,
    lastStatus: FOCUS_STATUSES.includes(value.lastStatus as FocusStatus) ? (value.lastStatus as FocusStatus) : fallback.lastStatus
  };
}

function normalizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatMessage =>
      isRecord(item) &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string"
    )
    .slice(-40);
}
