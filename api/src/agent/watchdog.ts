import type { FocusStatus, InterventionLevel, Session, Watch } from "../types.js";
import { freshWatch } from "../types.js";

export interface WatchdogConfig {
  /** how long after a check-in we wait before escalating, if they're still slipping */
  graceMs: number;
}

export const DEFAULT_WATCHDOG: WatchdogConfig = { graceMs: 60_000 };

export type WatchdogAction =
  | { type: "none" }                                                  // all good / nothing to do
  | { type: "checkin"; reason: string }                              // first offense — ping the user
  | { type: "waiting"; reason: string }                             // inside grace window
  | { type: "escalate"; level: InterventionLevel; reason: string }; // grace expired, still slipping

function isBad(status: FocusStatus): boolean {
  return status === "off_task" || status === "destructive";
}

/**
 * Pure reducer: given the current watch state, the session, and a fresh verdict,
 * return the next watch state and the action to take.
 *
 *   good verdict          → reset, no action
 *   first bad verdict     → check-in text + start grace window
 *   bad, within grace      → wait
 *   bad, grace expired     → escalate once (per the session's intervention level)
 */
export function step(
  watch: Watch,
  session: Session,
  status: FocusStatus,
  reason: string,
  now: number,
  config: WatchdogConfig = DEFAULT_WATCHDOG
): { watch: Watch; action: WatchdogAction } {
  if (!isBad(status)) {
    // back on track — clear the episode
    return { watch: { ...freshWatch(), lastStatus: status }, action: { type: "none" } };
  }

  const strikes = watch.strikes + 1;

  // first offense of this episode → check in and start the clock
  if (watch.checkInSentAt == null) {
    return {
      watch: { strikes, lastStatus: status, checkInSentAt: now, graceUntil: now + config.graceMs, escalated: false },
      action: { type: "checkin", reason }
    };
  }

  // still inside the grace window — give them a chance to course-correct
  if (now < (watch.graceUntil ?? 0)) {
    return { watch: { ...watch, strikes, lastStatus: status }, action: { type: "waiting", reason } };
  }

  // grace expired and still slipping → escalate (once)
  if (watch.escalated) {
    return { watch: { ...watch, strikes, lastStatus: status }, action: { type: "none" } };
  }
  return {
    watch: { ...watch, strikes, lastStatus: status, escalated: true },
    action: { type: "escalate", level: session.interventionLevel, reason }
  };
}
