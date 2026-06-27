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

/** Per-user grace-window state driving check-in → escalation. */
export interface Watch {
  strikes: number;                // consecutive bad verdicts
  lastStatus: FocusStatus;
  checkInSentAt: number | null;   // when we pinged them, null = none pending
  graceUntil: number | null;      // escalate once we pass this while still bad
  escalated: boolean;             // already escalated this episode
}

export interface Stats { nudges: number; snitches: number; checkIns: number; lastStatus: FocusStatus; }

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
  return { strikes: 0, lastStatus: "ok", checkInSentAt: null, graceUntil: null, escalated: false };
}
