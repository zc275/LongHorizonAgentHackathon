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
`);

export function databaseHealth() {
  const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
  return { ok: row.ok === 1, path: databasePath };
}
