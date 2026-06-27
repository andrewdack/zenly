import { describe, expect, it } from "vitest";
import { step, type WatchdogConfig } from "../src/agent/watchdog.js";
import { freshWatch, type Session } from "../src/types.js";

const CONFIG: WatchdogConfig = { graceMs: 1000 };

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
  it("does nothing while on task", () => {
    const { watch, action } = step(freshWatch(), session(), "on_task", "working", 0, CONFIG);
    expect(action).toEqual({ type: "none" });
    expect(watch.checkInSentAt).toBeNull();
  });

  it("checks in on the first bad verdict and starts the grace window", () => {
    const { watch, action } = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG);
    expect(action).toEqual({ type: "checkin", reason: "tiktok" });
    expect(watch.checkInSentAt).toBe(1000);
    expect(watch.graceUntil).toBe(2000);
    expect(watch.strikes).toBe(1);
  });

  it("waits while still inside the grace window", () => {
    const first = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG).watch;
    const { action } = step(first, session(), "destructive", "still tiktok", 1500, CONFIG);
    expect(action.type).toBe("waiting");
  });

  it("escalates once the grace window expires and they're still slipping", () => {
    const first = step(freshWatch(), session(), "destructive", "tiktok", 1000, CONFIG).watch;
    const { watch, action } = step(first, session(), "destructive", "still tiktok", 2500, CONFIG);
    expect(action).toEqual({ type: "escalate", level: "snitch", reason: "still tiktok" });
    expect(watch.escalated).toBe(true);
  });

  it("does not escalate twice in the same episode", () => {
    const a = step(freshWatch(), session(), "destructive", "x", 1000, CONFIG).watch;
    const b = step(a, session(), "destructive", "x", 2500, CONFIG).watch;
    const { action } = step(b, session(), "destructive", "x", 3000, CONFIG);
    expect(action).toEqual({ type: "none" });
  });

  it("resets the episode when they get back on track", () => {
    const slipped = step(freshWatch(), session(), "off_task", "reddit", 1000, CONFIG).watch;
    const { watch, action } = step(slipped, session(), "on_task", "back to work", 1500, CONFIG);
    expect(action).toEqual({ type: "none" });
    expect(watch.checkInSentAt).toBeNull();
    expect(watch.strikes).toBe(0);
  });

  it("uses the session's intervention level when escalating", () => {
    const s = session({ interventionLevel: "nudge" });
    const first = step(freshWatch(), s, "off_task", "youtube", 1000, CONFIG).watch;
    const { action } = step(first, s, "off_task", "youtube", 2500, CONFIG);
    expect(action).toMatchObject({ type: "escalate", level: "nudge" });
  });
});
