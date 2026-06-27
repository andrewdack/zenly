import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let db: Database.Database | null = null;

/** Lazily open the SQLite database (created on first use) and run migrations. */
export function getDb(): Database.Database {
  if (db) return db;

  // ":memory:" for tests; a file path otherwise.
  const path = process.env.ZENLY_DB_PATH ?? resolve(process.cwd(), "data/zenly.db");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

/** Reset the singleton (tests). */
export function closeDb() {
  db?.close();
  db = null;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      phone       TEXT PRIMARY KEY,
      name        TEXT,
      prefs_json  TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT NOT NULL,
      kind        TEXT NOT NULL,          -- 'behavior' | 'preference'
      fact        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memories_phone ON memories(phone);

    CREATE TABLE IF NOT EXISTS verdicts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT NOT NULL,
      status      TEXT NOT NULL,          -- on_task | off_task | destructive | ok
      category    TEXT,                   -- social | games | gambling | other | null
      reason      TEXT,
      mode        TEXT,                   -- task | guardian
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_verdicts_phone ON verdicts(phone);

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT NOT NULL,
      type        TEXT NOT NULL,          -- checkin | nudge | snitch
      detail      TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_phone ON events(phone);
  `);
}
