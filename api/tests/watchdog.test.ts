import { describe, expect, it } from "vitest";
import { step, type WatchdogConfig } from "../src/agent/watchdog.js";
import { freshWatch, type Session } from "../src/types.js";

const CONFIG: WatchdogConfig = { checkInCooldownMs: 1000, windowMs: 5000, snitchAfter: 3 };

function session(overrides: Partial<Session> = {}): Session {
  return {
    mode: "task",
    task: "history essay",
    durationMinutes: null,
    startedAt: 0,
    interventionLevel: "snitch",
    contactPhone: "+15555555555",
    ...overrides
  };
}

describe("watchdog.step", () => {
  it("does nothing and resets while on task", () => {
    const dirty = { ...freshWatch(), checkInTimes: [1000, 2000], escalated: true, strikes: 2 };
    const { watch, action } = step(dirty, session(), "on_task", "working", 3000, CONFIG);
    expect(action).toEqual({ type: "none" });
    expect(watch.checkInTimes).toEqual([]);
    expect(watch.escalated).toBe(false);
    expect(watch.strikes).toBe(0);
  });

  it("checks in on the first bad verdict and records the check-in time", () => {
    const { watch, action } = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG);
    expect(action).toEqual({ type: "checkin", reason: "tiktok" });
    expect(watch.checkInTimes).toEqual([1000]);
    expect(watch.strikes).toBe(1);
  });

  it("waits while still inside the check-in cooldown", () => {
    const first = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG).watch;
    const { action, watch } = step(first, session(), "destructive", "still tiktok", 1500, CONFIG);
    expect(action.type).toBe("waiting");
    expect(watch.checkInTimes).toEqual([1000]);
  });

  it("re-checks in after cooldown, then escalates once enough check-ins land in-window", () => {
    const a = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG).watch;
    const b = step(a, session(), "destructive", "still tiktok", 2000, CONFIG).watch;
    const { watch, action } = step(b, session(), "destructive", "still tiktok", 3000, CONFIG);
    expect(action).toEqual({ type: "escalate", level: "snitch", reason: "still tiktok" });
    expect(watch.escalated).toBe(true);
    expect(watch.checkInTimes).toEqual([]);
  });

  it("prunes old check-ins outside the rolling window", () => {
    const config: WatchdogConfig = { checkInCooldownMs: 1000, windowMs: 1500, snitchAfter: 3 };
    const first = step(freshWatch(), session(), "off_task", "reddit", 1000, config).watch;
    const second = step(first, session(), "off_task", "reddit", 3000, config);
    expect(second.action).toEqual({ type: "checkin", reason: "reddit" });
    expect(second.watch.checkInTimes).toEqual([3000]);
  });

  it("does not escalate twice in the same episode", () => {
    const a = step(freshWatch(), session(), "destructive", "x", 1000, CONFIG).watch;
    const b = step(a, session(), "destructive", "x", 2000, CONFIG).watch;
    const c = step(b, session(), "destructive", "x", 3000, CONFIG).watch;
    const { action } = step(c, session(), "destructive", "x", 4000, CONFIG);
    expect(action.type).not.toBe("escalate");
  });

  it("resets the episode when they get back on track", () => {
    const slipped = step(freshWatch(), session(), "off_task", "reddit", 1000, CONFIG).watch;
    const { watch, action } = step(slipped, session(), "on_task", "back to work", 1500, CONFIG);
    expect(action).toEqual({ type: "none" });
    expect(watch.checkInTimes).toEqual([]);
    expect(watch.strikes).toBe(0);
  });

  it("uses the session's intervention level when escalating", () => {
    const s = session({ interventionLevel: "nudge" });
    const a = step(freshWatch(), s, "off_task", "youtube", 1000, CONFIG).watch;
    const b = step(a, s, "off_task", "youtube", 2000, CONFIG).watch;
    const { action } = step(b, s, "off_task", "youtube", 3000, CONFIG);
    expect(action).toMatchObject({ type: "escalate", level: "nudge" });
  });
});
