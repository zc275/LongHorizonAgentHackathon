import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databasePath = resolve(process.env.DATABASE_PATH ?? "data/nightwatch.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db: Database.Database = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    frame_id TEXT NOT NULL,
    video_timestamp REAL NOT NULL,
    provider TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, frame_id)
  );

  CREATE TABLE IF NOT EXISTS mutation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    state_version INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    video_timestamp REAL NOT NULL,
    frame_id TEXT,
    situation_id TEXT,
    mutation_json TEXT NOT NULL,
    state_after_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS state_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    state_version INTEGER NOT NULL,
    video_timestamp REAL NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS situations (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    situation_id TEXT NOT NULL,
    situation_type TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(session_id, situation_id)
  );

  CREATE TABLE IF NOT EXISTS evidence_frames (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    frame_id TEXT NOT NULL,
    video_timestamp REAL NOT NULL,
    thumbnail_url TEXT,
    metadata_json TEXT NOT NULL,
    PRIMARY KEY(session_id, frame_id)
  );

  CREATE TABLE IF NOT EXISTS processing_metrics (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    metrics_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_observations_session_time
    ON observations(session_id, video_timestamp);
  CREATE INDEX IF NOT EXISTS idx_mutations_session_version
    ON mutation_events(session_id, state_version);
`);

export function databaseHealth() {
  const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
  return { ok: row.ok === 1, path: databasePath };
}
