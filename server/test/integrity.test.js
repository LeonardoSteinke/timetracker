import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timetracker-test-'));
process.env.DATA_DIR = testDir;
process.env.JWT_SECRET = 'test-secret-123456789';

const { default: db, DEFAULT_SCHEDULE } = await import('../db.js');
const {
  computeDay,
  dayBalance,
  isDateKey,
  isoFromLocal,
  localDateKey,
  remainingWithBreak,
  shortBreakAround,
} = await import('../time.js');
const { normalizeDay } = await import('../normalize.js');
const { getSettings, rangeSummaries } = await import('../summary.js');
const { BACKUP_DIR, listBackups, runDailyBackup } = await import('../backup.js');
const { agoraEmSegundos, novaVersaoSenha, sessionIsCurrent } = await import('../auth.js');
const { canAdminResetPassword } = await import('../routes/admin.js');

after(async () => {
  db.close();
  await fs.rm(testDir, { recursive: true, force: true });
});

test('calcula trabalho, intervalo e sessão aberta', () => {
  const punches = [
    { ts: '2026-08-03T12:00:00.000Z' },
    { ts: '2026-08-03T16:00:00.000Z' },
    { ts: '2026-08-03T16:30:00.000Z' },
    { ts: '2026-08-03T20:30:00.000Z' },
  ];
  assert.deepEqual(computeDay(punches), {
    workedMinutes: 480,
    breakMinutes: 30,
    open: false,
    state: 'off',
  });
  assert.equal(computeDay(punches.slice(0, 3), '2026-08-03T17:00:00.000Z').workedMinutes, 270);
});

test('aplica tolerância e intervalo mínimo nas bordas', () => {
  assert.deepEqual(dayBalance(475, 480, 10), { raw: -5, effective: 0 });
  assert.deepEqual(dayBalance(469, 480, 10), { raw: -11, effective: -11 });
  assert.equal(remainingWithBreak(240, 480, 10, 30, true), 260);
  assert.equal(remainingWithBreak(240, 480, 10, 30, false), 240);
  assert.equal(
    shortBreakAround(
      [
        { ts: '2026-08-03T12:00:00.000Z' },
        { ts: '2026-08-03T16:00:00.000Z' },
        { ts: '2026-08-03T16:20:00.000Z' },
      ],
      '2026-08-03T16:20:00.000Z',
      30
    ),
    20
  );
});

test('converte data local e UTC no fuso configurado', () => {
  const iso = isoFromLocal('2026-08-03', '09:15', 'America/Sao_Paulo');
  assert.equal(iso, '2026-08-03T12:15:00.000Z');
  assert.equal(localDateKey(iso, 'America/Sao_Paulo'), '2026-08-03');
});

test('normaliza pontos retroativos alternando entrada e saída', () => {
  const userId = db.prepare("INSERT INTO users (name, username, password_hash) VALUES ('Teste','teste','x')").run().lastInsertRowid;
  db.prepare('INSERT INTO settings (user_id, schedule) VALUES (?, ?)').run(userId, JSON.stringify(DEFAULT_SCHEDULE));
  const insert = db.prepare("INSERT INTO punches (user_id, ts, kind) VALUES (?, ?, 'clock_in')");
  insert.run(userId, '2026-08-03T15:00:00.000Z');
  insert.run(userId, '2026-08-03T12:00:00.000Z');
  insert.run(userId, '2026-08-03T13:00:00.000Z');

  normalizeDay(userId, '2026-08-03', 'America/Sao_Paulo');
  const kinds = db.prepare('SELECT kind FROM punches WHERE user_id = ? ORDER BY ts').all(userId).map((p) => p.kind);
  assert.deepEqual(kinds, ['clock_in', 'clock_out', 'clock_in']);

  const [summary] = rangeSummaries(
    userId,
    '2026-08-03',
    '2026-08-03',
    getSettings(userId),
    '2026-08-03T16:00:00.000Z'
  );
  assert.equal(summary.workedMinutes, 120);
  assert.equal(summary.breakMinutes, 120);
  assert.equal(summary.open, true);
});

test('índice client_id impede duplicação da fila offline', () => {
  const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('teste').id;
  const insert = db.prepare(
    "INSERT INTO punches (user_id, ts, kind, client_id) VALUES (?, ?, 'clock_in', ?)"
  );
  insert.run(userId, '2026-08-04T12:00:00.000Z', 'offline-client-1');
  assert.throws(
    () => insert.run(userId, '2026-08-04T13:00:00.000Z', 'offline-client-1'),
    /UNIQUE constraint failed/
  );
});

test('backup é consistente e conserva somente os três dias mais recentes', async () => {
  for (const day of ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04']) {
    const result = await runDailyBackup(new Date(`${day}T12:00:00.000Z`));
    assert.equal(result.created, true);
  }
  assert.deepEqual(await listBackups(), [
    'timetracker-2026-08-04.db',
    'timetracker-2026-08-03.db',
    'timetracker-2026-08-02.db',
  ]);
  const newest = path.join(BACKUP_DIR, 'timetracker-2026-08-04.db');
  assert.ok((await fs.stat(newest)).size > 0);
});

test('reset administrativo invalida até sessão emitida no mesmo segundo', () => {
  const user = { password_changed_at: 100 };
  assert.equal(sessionIsCurrent({ iat: 100 }, user), false);
  assert.equal(sessionIsCurrent({ iat: 101 }, user), true);
  assert.equal(sessionIsCurrent({ iat: 100, pwd: 100 }, user), true);
  assert.equal(sessionIsCurrent({ iat: 101, pwd: 99 }, user), false);

  const futureVersion = agoraEmSegundos() + 10;
  assert.equal(novaVersaoSenha(futureVersion), futureVersion + 1);
});

test('painel admin recusa redefinição da própria senha', () => {
  assert.equal(canAdminResetPassword(7, 7), false);
  assert.equal(canAdminResetPassword(7, 8), true);
});

test('validação rejeita datas inexistentes', () => {
  assert.equal(isDateKey('2026-02-28'), true);
  assert.equal(isDateKey('2024-02-29'), true);
  assert.equal(isDateKey('2026-02-29'), false);
  assert.equal(isDateKey('2026-02-31'), false);
  assert.equal(isDateKey('2026-13-01'), false);
});
