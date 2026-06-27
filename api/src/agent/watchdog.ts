import type { FocusStatus, InterventionLevel, Session, Watch } from "../types.js";
import { freshWatch } from "../types.js";

export interface WatchdogConfig {
  /** minimum wall-clock time between check-ins while the user remains off task */
  checkInCooldownMs: number;
  /** rolling window used to count repeated check-ins toward escalation */
  windowMs: number;
  /** escalate once this many check-ins happen inside the window */
  snitchAfter: number;
}

export const DEFAULT_WATCHDOG: WatchdogConfig = {
  checkInCooldownMs: 10_000,
  windowMs: 300_000,
  snitchAfter: 2
};

export type WatchdogAction =
  | { type: "none" }                                                 // all good / nothing to do
  | { type: "checkin"; reason: string }                              // ping the user
  | { type: "waiting"; reason: string }                              // still inside the check-in cooldown
  | { type: "escalate"; level: InterventionLevel; reason: string }; // enough check-ins in-window

function isBad(status: FocusStatus): boolean {
  return status === "off_task" || status === "destructive";
}

/**
 * Pure reducer: given the current watch state, the session, and a fresh verdict,
 * return the next watch state and the action to take.
 *
 *   good verdict                 → reset the episode, no action
 *   bad, cooldown elapsed        → check in and record the ping time
 *   3 check-in slots in-window   → escalate once per episode
 *   bad, cooldown active         → wait
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
    // back on track — clear the episode and allow future escalation if they slip again
    return { watch: { ...freshWatch(), lastStatus: status }, action: { type: "none" } };
  }

  const strikes = watch.strikes + 1;
  const recentCheckIns = watch.checkInTimes.filter((t) => now - t <= config.windowMs);
  const lastCheckInAt = recentCheckIns.at(-1);
  const cooldownElapsed = lastCheckInAt == null || now - lastCheckInAt >= config.checkInCooldownMs;

  if (!cooldownElapsed) {
    return {
      watch: { ...watch, strikes, lastStatus: status, checkInTimes: recentCheckIns },
      action: { type: "waiting", reason }
    };
  }

  const checkInTimes = [...recentCheckIns, now];
  const shouldEscalate = checkInTimes.length >= config.snitchAfter && !watch.escalated;

  if (shouldEscalate) {
    return {
      watch: { strikes, lastStatus: status, checkInTimes: [], escalated: true },
      action: { type: "escalate", level: session.interventionLevel, reason }
    };
  }

  return {
    watch: { strikes, lastStatus: status, checkInTimes, escalated: watch.escalated },
    action: { type: "checkin", reason }
  };
}
