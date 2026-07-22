// O ponto alterna sempre entrada → saída → entrada → saída. O tipo não é
// escolhido por quem registra: ele vem da posição do ponto no dia. Toda escrita
// em `punches` passa por `normalizeDay`, que reescreve os tipos em ordem de
// horário — assim é impossível o banco guardar duas saídas seguidas.

import db from './db.js';
import { localDateKey } from './time.js';
import { getSettings, addDays } from './summary.js';

const selectDay = db.prepare(
  'SELECT id, ts, kind FROM punches WHERE user_id = ? AND ts >= ? AND ts < ? ORDER BY ts, id'
);
const setKind = db.prepare('UPDATE punches SET kind = ? WHERE id = ?');

/** Reescreve os tipos dos pontos de um dia local, alternando entrada/saída. */
export function normalizeDay(userId, dateKey, timezone) {
  // janela UTC folgada; o filtro exato é pela data local de cada ponto
  const fromIso = addDays(dateKey, -1) + 'T00:00:00.000Z';
  const toIso = addDays(dateKey, 2) + 'T00:00:00.000Z';
  const rows = selectDay
    .all(userId, fromIso, toIso)
    .filter((p) => localDateKey(p.ts, timezone) === dateKey);

  db.transaction(() => {
    rows.forEach((p, i) => {
      const kind = i % 2 === 0 ? 'clock_in' : 'clock_out';
      if (p.kind !== kind) setKind.run(kind, p.id);
    });
  })();
  return rows.length;
}

/**
 * Migração única: os antigos `break_start`/`break_end` viram saída/entrada — o
 * intervalo passou a ser o buraco entre uma saída e a entrada seguinte, então o
 * tempo trabalhado continua o mesmo. Depois normaliza todos os dias.
 */
export function migrateAlternatingPunches() {
  if (db.pragma('user_version', { simple: true }) >= 1) return;

  db.transaction(() => {
    db.prepare("UPDATE punches SET kind = 'clock_out' WHERE kind = 'break_start'").run();
    db.prepare("UPDATE punches SET kind = 'clock_in' WHERE kind = 'break_end'").run();
  })();

  const users = db.prepare('SELECT DISTINCT user_id AS id FROM punches').all();
  let dias = 0;
  for (const { id } of users) {
    const { timezone } = getSettings(id);
    const keys = new Set(
      db.prepare('SELECT ts FROM punches WHERE user_id = ?').all(id).map((p) => localDateKey(p.ts, timezone))
    );
    for (const key of keys) {
      normalizeDay(id, key, timezone);
      dias++;
    }
  }

  db.pragma('user_version = 1');
  console.log(`migração: pontos alternando entrada/saída (${users.length} usuário(s), ${dias} dia(s))`);
}
