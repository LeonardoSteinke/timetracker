import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'timetracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schedule padrão: seg–sex 8h48 (528 min) com 60 min de intervalo — as 44h
// semanais da CLT; fim de semana livre.
/** Intervalo mínimo padrão (minutos) entre uma saída e a entrada seguinte. */
export const DEFAULT_MIN_BREAK = 30;
/** Tolerância padrão (minutos): diferença menor que isso não vira saldo. */
export const DEFAULT_TOLERANCE = 10;

export const DEFAULT_SCHEDULE = {
  0: { expected: 0, break: 0 }, // domingo
  1: { expected: 528, break: 60 },
  2: { expected: 528, break: 60 },
  3: { expected: 528, break: 60 },
  4: { expected: 528, break: 60 },
  5: { expected: 528, break: 60 },
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
    tolerance_minutes INTEGER NOT NULL DEFAULT 10,
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


  -- Assinaturas de Web Push: uma por aparelho (o endpoint é a identidade dele).
  -- A preferência de quais avisos receber é do usuário e vive em settings.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_ok_at TEXT
  );

  -- Marca o que já foi avisado, para o agendador (que roda a cada minuto) não
  -- repetir o mesmo aviso. A coluna key é a data local no fim de jornada e o ts
  -- do ponto que abriu o intervalo no aviso de intervalo cumprido.
  CREATE TABLE IF NOT EXISTS notifications_sent (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL,
    key     TEXT NOT NULL,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, kind, key)
  );


  -- Convites: é como entra quem não tem o código do .env. O estado não é uma
  -- coluna, sai das datas — pendente é o que não foi usado e ainda não venceu.
  -- Revogar apaga a linha, e o convite morre junto com quem o usou (CASCADE nas
  -- duas pontas): a lista mostra só o que ainda significa alguma coisa.
  CREATE TABLE IF NOT EXISTS invites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,
    inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
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

// ── Preferências de notificação ──────────────────────────────────────────────
// Quais avisos o usuário quer receber. Ligados por padrão: quem não assinar o
// push em nenhum aparelho não recebe nada de qualquer jeito.
export const NOTIFY_DEFAULTS = {
  notify_end_of_day: 1,
  notify_end_lead_minutes: 0, // 0 = avisar na hora em que a jornada fecha
  notify_break_done: 1,
};

for (const [col, valor] of Object.entries(NOTIFY_DEFAULTS)) {
  if (!settingsCols.includes(col)) {
    db.exec(`ALTER TABLE settings ADD COLUMN ${col} INTEGER NOT NULL DEFAULT ${valor}`);
  }
}

// ── Convites e nível de acesso ───────────────────────────────────────────────
// Quantas pessoas cada usuário pode trazer. Admin master ajusta por usuário.
export const DEFAULT_INVITE_QUOTA = 5;
/** Prazo de um convite pendente. Vencido, ele volta a valer como vaga livre. */
export const INVITE_TTL_DAYS = 7;

const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('invite_quota')) {
  db.exec(`ALTER TABLE users ADD COLUMN invite_quota INTEGER NOT NULL DEFAULT ${DEFAULT_INVITE_QUOTA}`);
  // Quem já estava dentro entrou pelo código do .env, que agora define master —
  // então todos viram master. Fica dentro deste if de propósito: é migração de
  // uma vez só, e não pode voltar a promover quem for rebaixado depois.
  const n = db.prepare('UPDATE users SET is_admin = 1 WHERE is_admin = 0').run().changes;
  if (n) console.log(`migração: ${n} usuário(s) promovido(s) a admin master`);
}

// Sessão emitida antes da última troca de senha para de valer. Sem isso o JWT de
// 30 dias sobrevive ao reset feito pelo admin, que é justamente o que se quer
// cortar quando uma conta é comprometida.
if (!userCols.includes('password_changed_at')) {
  db.exec('ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0');
}

// ── Convite revogado deixou de existir ───────────────────────────────────────
// A primeira versão marcava `revoked_at` e mantinha a linha na lista, e um
// convite cujo convidado fosse excluído virava "aceito por ninguém". Agora
// revogar apaga, e o convite some junto com a conta que o usou — o que exige
// trocar o ON DELETE SET NULL por CASCADE. Chave estrangeira no SQLite não se
// altera no lugar: a tabela é reconstruída.
const inviteCols = db.prepare('PRAGMA table_info(invites)').all().map((c) => c.name);
if (inviteCols.includes('revoked_at')) {
  db.pragma('foreign_keys = OFF'); // não pode mudar dentro de transação
  db.exec(`
    BEGIN;
    DELETE FROM invites WHERE revoked_at IS NOT NULL;
    DELETE FROM invites WHERE used_at IS NOT NULL AND invitee_id IS NULL;

    CREATE TABLE invites_novo (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL UNIQUE,
      inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      used_at    TEXT
    );
    INSERT INTO invites_novo (id, code, inviter_id, invitee_id, created_at, expires_at, used_at)
      SELECT id, code, inviter_id, invitee_id, created_at, expires_at, used_at FROM invites;

    DROP TABLE invites;
    ALTER TABLE invites_novo RENAME TO invites;
    CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_id);
    COMMIT;
  `);
  db.pragma('foreign_keys = ON');
  console.log('migração: convites reconstruídos (revogado apaga, convidado excluído leva o convite)');
}

export default db;
