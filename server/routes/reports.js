import express from 'express';
import { requireAuth } from '../auth.js';
import { localDateKey } from '../time.js';
import { getSettings, rangeSummaries, totalBalance, addDays } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

/** Início da semana que contém `dateKey`, respeitando week_start (0=dom,1=seg). */
function weekStartOf(dateKey, weekStart) {
  const dow = new Date(dateKey + 'T00:00:00Z').getUTCDay();
  const diff = (dow - weekStart + 7) % 7;
  return addDays(dateKey, -diff);
}

/** Semana de 7 dias. ?start=YYYY-MM-DD (opcional) ou semana atual. */
router.get('/week', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const todayKey = localDateKey(nowIso, settings.timezone);
  const start = req.query.start
    ? weekStartOf(String(req.query.start), settings.week_start)
    : weekStartOf(todayKey, settings.week_start);
  const end = addDays(start, 6);

  const days = rangeSummaries(req.user.id, start, end, settings, nowIso);
  const worked = days.reduce((s, d) => s + d.workedMinutes, 0);
  const expected = days.reduce((s, d) => s + d.expectedMinutes, 0);
  const balance = days.reduce((s, d) => s + d.balance, 0);
  res.json({ start, end, days, totals: { worked, expected, balance }, weekStart: settings.week_start });
});

/** Histórico por intervalo. ?from=&to= (YYYY-MM-DD). */
router.get('/range', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const todayKey = localDateKey(nowIso, settings.timezone);
  const to = String(req.query.to || todayKey);
  const from = String(req.query.from || addDays(to, -29));

  const days = rangeSummaries(req.user.id, from, to, settings, nowIso);
  const worked = days.reduce((s, d) => s + d.workedMinutes, 0);
  const expected = days.reduce((s, d) => s + d.expectedMinutes, 0);
  const balance = days.reduce((s, d) => s + d.balance, 0);
  res.json({ from, to, days, totals: { worked, expected, balance } });
});

/** Saldo total acumulado do banco de horas. */
router.get('/total', (req, res) => {
  const settings = getSettings(req.user.id);
  res.json(totalBalance(req.user.id, settings, new Date().toISOString()));
});

export default router;
