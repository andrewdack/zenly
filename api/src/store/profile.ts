import { getDb } from "./db.js";
import type { FocusStatus } from "../types.js";

export type MemoryKind = "behavior" | "preference";

export interface Memory { id: number; kind: MemoryKind; fact: string; createdAt: number; }

export interface Profile {
  phone: string;
  name: string | null;
  prefs: Record<string, unknown>;
  memories: Memory[];
}

export interface BehaviorStats {
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  checkIns: number;
  snitches: number;
}

function now() { return Date.now(); }

/** Create or update a user's name/prefs. Only provided fields are written. */
export function upsertUser(phone: string, fields: { name?: string | null; prefs?: Record<string, unknown> } = {}) {
  const db = getDb();
  const ts = now();
  db.prepare(
    `INSERT INTO users (phone, name, prefs_json, created_at, updated_at)
     VALUES (@phone, @name, COALESCE(@prefs, '{}'), @ts, @ts)
     ON CONFLICT(phone) DO UPDATE SET
       name = COALESCE(@name, users.name),
       prefs_json = COALESCE(@prefs, users.prefs_json),
       updated_at = @ts`
  ).run({
    phone,
    name: fields.name ?? null,
    prefs: fields.prefs ? JSON.stringify(fields.prefs) : null,
    ts
  });
}

export function getName(phone: string): string | null {
  const row = getDb().prepare(`SELECT name FROM users WHERE phone = ?`).get(phone) as { name: string | null } | undefined;
  return row?.name ?? null;
}

export function getProfile(phone: string): Profile {
  const db = getDb();
  const user = db.prepare(`SELECT name, prefs_json FROM users WHERE phone = ?`).get(phone) as
    | { name: string | null; prefs_json: string }
    | undefined;
  return {
    phone,
    name: user?.name ?? null,
    prefs: user ? safeJson(user.prefs_json) : {},
    memories: getMemories(phone)
  };
}

export function addMemory(phone: string, kind: MemoryKind, fact: string) {
  const trimmed = fact.trim();
  if (!trimmed) return;
  const db = getDb();
  // dedupe: skip if we already stored this exact fact for the user
  const exists = db.prepare(`SELECT 1 FROM memories WHERE phone = ? AND fact = ? LIMIT 1`).get(phone, trimmed);
  if (exists) return;
  db.prepare(`INSERT INTO memories (phone, kind, fact, created_at) VALUES (?, ?, ?, ?)`).run(phone, kind, trimmed, now());
}

export function getMemories(phone: string, limit = 50): Memory[] {
  const rows = getDb()
    .prepare(`SELECT id, kind, fact, created_at FROM memories WHERE phone = ? ORDER BY created_at DESC LIMIT ?`)
    .all(phone, limit) as Array<{ id: number; kind: MemoryKind; fact: string; created_at: number }>;
  return rows.map((r) => ({ id: r.id, kind: r.kind, fact: r.fact, createdAt: r.created_at }));
}

export function logVerdict(phone: string, status: FocusStatus, category: string | null, reason: string, mode: string) {
  getDb()
    .prepare(`INSERT INTO verdicts (phone, status, category, reason, mode, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(phone, status, category, reason, mode, now());
}

export function logEvent(phone: string, type: "checkin" | "nudge" | "snitch", detail: string) {
  getDb().prepare(`INSERT INTO events (phone, type, detail, created_at) VALUES (?, ?, ?, ?)`).run(phone, type, detail, now());
}

export function recentVerdicts(phone: string, limit = 30) {
  return getDb()
    .prepare(`SELECT status, category, reason, mode, created_at FROM verdicts WHERE phone = ? ORDER BY created_at DESC LIMIT ?`)
    .all(phone, limit) as Array<{ status: FocusStatus; category: string | null; reason: string; mode: string; created_at: number }>;
}

export function behaviorStats(phone: string): BehaviorStats {
  const db = getDb();
  const byStatus: Record<string, number> = {};
  for (const r of db.prepare(`SELECT status, COUNT(*) c FROM verdicts WHERE phone = ? GROUP BY status`).all(phone) as Array<{ status: string; c: number }>) {
    byStatus[r.status] = r.c;
  }
  const byCategory: Record<string, number> = {};
  for (const r of db.prepare(`SELECT category, COUNT(*) c FROM verdicts WHERE phone = ? AND category IS NOT NULL GROUP BY category`).all(phone) as Array<{ category: string; c: number }>) {
    byCategory[r.category] = r.c;
  }
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const checkIns = (db.prepare(`SELECT COUNT(*) c FROM events WHERE phone = ? AND type = 'checkin'`).get(phone) as { c: number }).c;
  const snitches = (db.prepare(`SELECT COUNT(*) c FROM events WHERE phone = ? AND type = 'snitch'`).get(phone) as { c: number }).c;
  return { total, byStatus, byCategory, checkIns, snitches };
}

/** How many times this user has been caught in a given destructive category (repeat-offender signal). */
export function offenseCount(phone: string, category: string | null): number {
  if (!category) return 0;
  const row = getDb()
    .prepare(`SELECT COUNT(*) c FROM verdicts WHERE phone = ? AND category = ?`)
    .get(phone, category) as { c: number };
  return row.c;
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}
