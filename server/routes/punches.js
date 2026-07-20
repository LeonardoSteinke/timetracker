import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { localDateKey } from '../time.js';
import { getSettings, rangeSummaries, totalBalance } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

const KINDS = ['clock_in', 'clock_out', 'break_start', 'break_end'];

/** Estado atual + resumo do dia (para o Dashboard "Hoje"). */
router.get('/today', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const todayKey = localDateKey(nowIso, settings.timezone);
  const [day] = rangeSummaries(req.user.id, todayKey, todayKey, settings, nowIso);
  const total = totalBalance(req.user.id, settings, nowIso);
  res.json({ today: day, totalBalance: total.totalBalance, now: nowIso, timezone: settings.timezone });
});

/** Registra um ponto no instante atual (ou informado). */
router.post('/', (req, res) => {
  const schema = z.object({
    kind: z.enum(KINDS),
    ts: z.string().datetime().optional(),
    note: z.string().max(200).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const ts = parsed.data.ts || new Date().toISOString();
  const info = db
    .prepare('INSERT INTO punches (user_id, ts, kind, note) VALUES (?,?,?,?)')
    .run(req.user.id, ts, parsed.data.kind, parsed.data.note || null);
  res.json({ id: info.lastInsertRowid, ts, kind: parsed.data.kind });
});

/** Edita o horário/observação de um ponto. */
router.patch('/:id', (req, res) => {
  const schema = z.object({
    ts: z.string().datetime().optional(),
    note: z.string().max(200).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const row = db.prepare('SELECT * FROM punches WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'não encontrado' });

  db.prepare('UPDATE punches SET ts = COALESCE(?, ts), note = COALESCE(?, note) WHERE id = ?')
    .run(parsed.data.ts ?? null, parsed.data.note ?? null, row.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM punches WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'não encontrado' });
  res.json({ ok: true });
});

export default router;
