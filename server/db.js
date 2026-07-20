import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'timetracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schedule padrão: seg–sex 8h (480 min) com 60 min de intervalo; fim de semana livre.
export const DEFAULT_SCHEDULE = {
  0: { expected: 0, break: 0 }, // domingo
  1: { expected: 480, break: 60 },
  2: { expected: 480, break: 60 },
  3: { expected: 480, break: 60 },
  4: { expected: 480, break: 60 },
  5: { expected: 480, break: 60 },
  6: { expected: 0, break: 0 }, // sábado
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tolerance_minutes INTEGER NOT NULL DEFAULT 5,
    timezone         TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    week_start       INTEGER NOT NULL DEFAULT 1,   -- 0=domingo, 1=segunda
    schedule         TEXT NOT NULL                 -- JSON: { "0":{expected,break}, ... }
  );

  CREATE TABLE IF NOT EXISTS punches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ts         TEXT NOT NULL,                       -- ISO 8601 UTC
    kind       TEXT NOT NULL CHECK (kind IN ('clock_in','clock_out','break_start','break_end')),
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_punches_user_ts ON punches(user_id, ts);
`);

export default db;
