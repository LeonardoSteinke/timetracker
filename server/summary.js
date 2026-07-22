import db, { DEFAULT_SCHEDULE } from './db.js';
import { localDateKey, weekdayOf, computeDay, dayBalance } from './time.js';

/** Carrega e normaliza as configurações do usuário. */
export function getSettings(userId) {
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
  if (!row) {
    return {
      tolerance_minutes: 5,
      timezone: process.env.TZ || 'America/Sao_Paulo',
      week_start: 1,
      schedule: DEFAULT_SCHEDULE,
    };
  }
  let schedule;
  try {
    schedule = JSON.parse(row.schedule);
  } catch {
    schedule = DEFAULT_SCHEDULE;
  }
  return { ...row, schedule };
}

function scheduledFor(dateKey, settings) {
  const wd = weekdayOf(dateKey);
  const day = settings.schedule[wd] || settings.schedule[String(wd)] || { expected: 0 };
  return day.expected || 0;
}

/**
 * Previsto do dia considerando exceções. Feriado/férias/atestado/folga zeram a
 * jornada; 'custom' define os minutos à mão.
 */
function expectedFor(dateKey, settings, override) {
  if (!override) return scheduledFor(dateKey, settings);
  if (override.kind === 'custom') return override.expected ?? scheduledFor(dateKey, settings);
  return 0;
}

/** Exceções do usuário entre duas datas, indexadas por 'YYYY-MM-DD'. */
export function overridesInRange(userId, fromKey, toKey) {
  const rows = db
    .prepare('SELECT date, kind, expected, note FROM day_overrides WHERE user_id = ? AND date BETWEEN ? AND ?')
    .all(userId, fromKey, toKey);
  return new Map(rows.map((r) => [r.date, r]));
}

/** Adiciona/subtrai dias de uma chave 'YYYY-MM-DD' (UTC-safe). */
export function addDays(dateKey, n) {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Agrupa os punches do usuário por dia local e devolve o resumo de cada dia
 * entre fromKey e toKey (inclusive). Sessão aberta do dia atual conta até agora.
 */
export function rangeSummaries(userId, fromKey, toKey, settings, nowIso) {
  // janela UTC com folga de 1 dia em cada ponta (cobre diferença de fuso)
  const fromIso = addDays(fromKey, -1) + 'T00:00:00.000Z';
  const toIso = addDays(toKey, 2) + 'T00:00:00.000Z';
  const rows = db
    .prepare('SELECT id, ts, kind, note FROM punches WHERE user_id = ? AND ts >= ? AND ts < ? ORDER BY ts')
    .all(userId, fromIso, toIso);

  const byDay = new Map();
  for (const p of rows) {
    const key = localDateKey(p.ts, settings.timezone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }

  const overrides = overridesInRange(userId, fromKey, toKey);
  const todayKey = localDateKey(nowIso, settings.timezone);
  const days = [];
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    const punches = byDay.get(key) || [];
    const isToday = key === todayKey;
    const c = computeDay(punches, isToday ? nowIso : null);
    const override = overrides.get(key) || null;
    const expected = expectedFor(key, settings, override);
    const bal = dayBalance(c.workedMinutes, expected, settings.tolerance_minutes);
    days.push({
      date: key,
      weekday: weekdayOf(key),
      workedMinutes: c.workedMinutes,
      breakMinutes: c.breakMinutes,
      expectedMinutes: expected,
      remainingMinutes: Math.max(0, expected - c.workedMinutes),
      balance: bal.effective,
      rawBalance: bal.raw,
      open: c.open,
      state: c.state,
      override,
      punches,
    });
  }
  return days;
}

/** Saldo total acumulado do banco de horas (todos os dias com registros). */
export function totalBalance(userId, settings, nowIso) {
  const first = db.prepare('SELECT MIN(ts) AS m FROM punches WHERE user_id = ?').get(userId);
  if (!first?.m) return { totalBalance: 0, days: 0 };
  const fromKey = localDateKey(first.m, settings.timezone);
  const toKey = localDateKey(nowIso, settings.timezone);
  const days = rangeSummaries(userId, fromKey, toKey, settings, nowIso);
  let total = 0;
  let counted = 0;
  for (const d of days) {
    if (d.punches.length > 0) {
      total += d.balance;
      counted++;
    }
  }
  return { totalBalance: total, days: counted };
}
