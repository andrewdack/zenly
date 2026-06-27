export type SessionMode = "task" | "guardian";
export type InterventionLevel = "nudge" | "snitch";

/** What the vision judge decides about a single frame. */
export type FocusStatus = "on_task" | "off_task" | "destructive" | "ok";

export interface ChatMessage { role: "user" | "assistant"; content: string; }

export interface Session {
  mode: SessionMode;
  task: string | null;            // null in guardian mode
  durationMinutes: number | null;
  startedAt: number;
  interventionLevel: InterventionLevel;
  contactPhone: string | null;    // needed to snitch
}

/** Per-user state driving repeated check-ins → escalation. */
export interface Watch {
  strikes: number;                // consecutive bad verdicts
  lastStatus: FocusStatus;
  checkInTimes: number[];         // recent check-in timestamps inside the escalation window
  escalated: boolean;             // already escalated this episode
}

export interface Stats { nudges: number; snitches: number; checkIns: number; lastStatus: FocusStatus; lastReason: string | null; }

export interface PhoneState {
  phone: string;
  history: ChatMessage[];
  session: Session | null;
  watch: Watch;
  stats: Stats;
}

export interface ParsedSession {
  mode: SessionMode;
  task: string | null;
  durationMinutes: number | null;
}

export function freshWatch(): Watch {
  return { strikes: 0, lastStatus: "ok", checkInTimes: [], escalated: false };
}
