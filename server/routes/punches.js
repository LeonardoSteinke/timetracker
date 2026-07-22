import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { localDateKey, isoFromLocal } from '../time.js';
import { getSettings, rangeSummaries, totalBalance } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

const KINDS = ['clock_in', 'clock_out', 'break_start', 'break_end'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Data+hora locais (edição manual de dias passados) ou ISO direto. */
const localTimeFields = {
  date: z.string().regex(DATE_RE).optional(),
  time: z.string().regex(TIME_RE).optional(),
};

/** Resolve o instante ISO a partir de `ts` ou do par `date`+`time` locais. */
function resolveTs(data, timezone) {
  if (data.date && data.time) return isoFromLocal(data.date, data.time, timezone);
  return data.ts || null;
}

/** Estado atual + resumo do dia (para o Dashboard "Hoje"). */
router.get('/today', (req, res) => {
  const settings = getSettings(req.user.id);
  const nowIso = new Date().toISOString();
  const todayKey = localDateKey(nowIso, settings.timezone);
  const [day] = rangeSummaries(req.user.id, todayKey, todayKey, settings, nowIso);
  const total = totalBalance(req.user.id, settings, nowIso);
  res.json({ today: day, totalBalance: total.totalBalance, now: nowIso, timezone: settings.timezone });
});

/** Registra um ponto no instante atual, num ISO informado ou em data+hora locais. */
router.post('/', (req, res) => {
  const schema = z.object({
    kind: z.enum(KINDS),
    ts: z.string().datetime().optional(),
    note: z.string().max(200).optional(),
    ...localTimeFields,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const settings = getSettings(req.user.id);
  const ts = resolveTs(parsed.data, settings.timezone) || new Date().toISOString();
  const info = db
    .prepare('INSERT INTO punches (user_id, ts, kind, note) VALUES (?,?,?,?)')
    .run(req.user.id, ts, parsed.data.kind, parsed.data.note || null);
  res.json({ id: info.lastInsertRowid, ts, kind: parsed.data.kind });
});

/** Edita horário, tipo ou observação de um ponto. */
router.patch('/:id', (req, res) => {
  const schema = z.object({
    ts: z.string().datetime().optional(),
    kind: z.enum(KINDS).optional(),
    note: z.string().max(200).nullable().optional(),
    ...localTimeFields,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const row = db.prepare('SELECT * FROM punches WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'não encontrado' });

  const settings = getSettings(req.user.id);
  const ts = resolveTs(parsed.data, settings.timezone) ?? row.ts;
  // `note` distingue ausente (mantém) de null (limpa) — por isso não usa COALESCE
  const note = 'note' in parsed.data ? parsed.data.note : row.note;
  db.prepare('UPDATE punches SET ts = ?, kind = ?, note = ? WHERE id = ?')
    .run(ts, parsed.data.kind ?? row.kind, note, row.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM punches WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'não encontrado' });
  res.json({ ok: true });
});

export default router;
