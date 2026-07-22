import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'timetracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schedule padrão: seg–sex 8h (480 min) com 60 min de intervalo; fim de semana livre.
/** Intervalo mínimo padrão (minutos) entre uma saída e a entrada seguinte. */
export const DEFAULT_MIN_BREAK = 30;

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
    min_break_minutes INTEGER NOT NULL DEFAULT 30,  -- intervalo mínimo (0 = sem checagem)
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


  -- Exceções de jornada: feriado, férias, atestado, folga ou jornada customizada
  -- num dia específico. Sobrepõe o schedule semanal no cálculo do previsto.
  CREATE TABLE IF NOT EXISTS day_overrides (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,                          -- 'YYYY-MM-DD' local
    kind     TEXT NOT NULL CHECK (kind IN ('holiday','vacation','sick','dayoff','custom')),
    expected INTEGER,                                -- só para kind='custom' (minutos)
    note     TEXT,
    PRIMARY KEY (user_id, date)
  );
`);

// ── client_id: idempotência da fila offline ──────────────────────────────────
// O app pode registrar pontos sem conexão e reenviá-los depois; se a resposta
// se perder no caminho, o mesmo ponto chega duas vezes. O id gerado no cliente
// deixa o INSERT idempotente (índice único; NULLs são distintos no SQLite, então
// pontos criados online continuam podendo omitir o campo).
const punchCols = db.prepare('PRAGMA table_info(punches)').all().map((c) => c.name);
if (!punchCols.includes('client_id')) {
  db.exec('ALTER TABLE punches ADD COLUMN client_id TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_punches_client ON punches(user_id, client_id)');

// ── min_break_minutes: intervalo mínimo entre uma saída e a entrada seguinte ──
// Registrar um intervalo menor que isso gera aviso (e só grava se confirmado).
// 0 desliga a checagem.
const settingsCols = db.prepare('PRAGMA table_info(settings)').all().map((c) => c.name);
if (!settingsCols.includes('min_break_minutes')) {
  db.exec('ALTER TABLE settings ADD COLUMN min_break_minutes INTEGER NOT NULL DEFAULT 30');
}

export default db;
