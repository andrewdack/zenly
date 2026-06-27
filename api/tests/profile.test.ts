process.env.ZENLY_DB_PATH = ":memory:";

import { afterAll, describe, expect, it } from "vitest";
import * as profile from "../src/store/profile.js";
import { closeDb } from "../src/store/db.js";

afterAll(() => closeDb());

const PHONE = "+15555550123";

describe("profile store", () => {
  it("upserts a name and reads it back", () => {
    profile.upsertUser(PHONE, { name: "andrew" });
    expect(profile.getName(PHONE)).toBe("andrew");

    // partial upsert keeps the existing name
    profile.upsertUser(PHONE, { prefs: { tone: "blunt" } });
    expect(profile.getName(PHONE)).toBe("andrew");
    expect(profile.getProfile(PHONE).prefs).toEqual({ tone: "blunt" });
  });

  it("stores memories and dedupes identical facts", () => {
    profile.addMemory(PHONE, "behavior", "doomscrolls instagram at night");
    profile.addMemory(PHONE, "behavior", "doomscrolls instagram at night"); // dup
    profile.addMemory(PHONE, "preference", "hates being snitched on");

    const mems = profile.getMemories(PHONE);
    expect(mems).toHaveLength(2);
    expect(mems.map((m) => m.fact)).toContain("hates being snitched on");
  });

  it("logs verdicts and aggregates behavior stats + offense counts", () => {
    profile.logVerdict(PHONE, "destructive", "gambling", "draftkings open", "guardian");
    profile.logVerdict(PHONE, "destructive", "gambling", "still betting", "guardian");
    profile.logVerdict(PHONE, "on_task", null, "vscode", "task");

    const stats = profile.behaviorStats(PHONE);
    expect(stats.total).toBe(3);
    expect(stats.byStatus.destructive).toBe(2);
    expect(stats.byCategory.gambling).toBe(2);
    expect(profile.offenseCount(PHONE, "gambling")).toBe(2);
    expect(profile.offenseCount(PHONE, "social")).toBe(0);
  });

  it("counts events for snitch/checkin", () => {
    profile.logEvent(PHONE, "checkin", "hey what's up");
    profile.logEvent(PHONE, "snitch", "your friend is gambling lol");
    const stats = profile.behaviorStats(PHONE);
    expect(stats.checkIns).toBe(1);
    expect(stats.snitches).toBe(1);
  });
});
