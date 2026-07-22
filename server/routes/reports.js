import express from 'express';
import { requireAuth } from '../auth.js';
import { localDateKey, localTimeKey, fmtMinutes } from '../time.js';
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

/**
 * Detalhe de um único dia, para a tela de edição. Cada ponto vem com a hora
 * local ('HH:MM') já resolvida no fuso do usuário — o cliente não faz conta de
 * fuso, só devolve date+time na edição.
 */
router.get('/day', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const date = String(req.query.date || localDateKey(nowIso, settings.timezone));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'data inválida' });

  const [day] = rangeSummaries(req.user.id, date, date, settings, nowIso);
  day.punches = day.punches.map((p) => ({ ...p, time: localTimeKey(p.ts, settings.timezone) }));
  res.json({ day, timezone: settings.timezone, today: localDateKey(nowIso, settings.timezone) });
});

/** Exportação CSV do período — abre direto no navegador (cookie de sessão). */
router.get('/export.csv', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const to = String(req.query.to || localDateKey(nowIso, settings.timezone));
  const from = String(req.query.from || addDays(to, -29));

  const days = rangeSummaries(req.user.id, from, to, settings, nowIso);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['data', 'dia_semana', 'entrada', 'saida', 'trabalhado', 'intervalo', 'previsto', 'saldo', 'excecao', 'observacao']
      .map(esc)
      .join(';'),
  ];

  const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  for (const d of days) {
    const ins = d.punches.filter((p) => p.kind === 'clock_in');
    const outs = d.punches.filter((p) => p.kind === 'clock_out');
    lines.push(
      [
        d.date,
        WD[d.weekday],
        ins.length ? localTimeKey(ins[0].ts, settings.timezone) : '',
        outs.length ? localTimeKey(outs[outs.length - 1].ts, settings.timezone) : '',
        fmtMinutes(d.workedMinutes),
        fmtMinutes(d.breakMinutes),
        fmtMinutes(d.expectedMinutes),
        fmtMinutes(d.balance, true),
        d.override?.kind || '',
        d.override?.note || '',
      ]
        .map(esc)
        .join(';')
    );
  }

  const totals = days.reduce(
    (a, d) => ({ w: a.w + d.workedMinutes, e: a.e + d.expectedMinutes, b: a.b + d.balance }),
    { w: 0, e: 0, b: 0 }
  );
  lines.push('');
  lines.push(['TOTAL', '', '', '', fmtMinutes(totals.w), '', fmtMinutes(totals.e), fmtMinutes(totals.b, true), '', '']
    .map(esc)
    .join(';'));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="timetracker_${from}_${to}.csv"`);
  res.send('﻿' + lines.join('\r\n')); // BOM: Excel pt-BR abre acentos corretamente
});

/** Saldo total acumulado do banco de horas. */
router.get('/total', (req, res) => {
  const settings = getSettings(req.user.id);
  res.json(totalBalance(req.user.id, settings, new Date().toISOString()));
});

export default router;
