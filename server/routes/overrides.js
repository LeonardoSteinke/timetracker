import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { weekdayOf } from '../time.js';
import { getSettings, addDays } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['holiday', 'vacation', 'sick', 'dayoff', 'custom'];
const MAX_RANGE_DAYS = 366;

const upsert = db.prepare(
  `INSERT INTO day_overrides (user_id, date, kind, expected, note)
   VALUES (@uid, @date, @kind, @expected, @note)
   ON CONFLICT(user_id, date) DO UPDATE SET
     kind = @kind, expected = @expected, note = @note`
);

/** Dias entre from e to (inclusive). */
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Exceções num intervalo. ?from=&to= (YYYY-MM-DD). */
router.get('/', (req, res) => {
  const from = String(req.query.from || '0000-01-01');
  const to = String(req.query.to || '9999-12-31');
  const rows = db
    .prepare('SELECT date, kind, expected, note FROM day_overrides WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date')
    .all(req.user.id, from, to);
  res.json({ overrides: rows });
});

/**
 * Aplica a mesma exceção a um período inteiro — férias, folga emendada,
 * atestado de vários dias. Por padrão só marca os dias que têm jornada
 * prevista, para não encher sábado/domingo de etiqueta.
 */
router.put('/range', (req, res) => {
  const schema = z.object({
    from: z.string().regex(DATE_RE),
    to: z.string().regex(DATE_RE),
    kind: z.enum(KINDS),
    expected: z.number().int().min(0).max(1440).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
    onlyWorkdays: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const { from, to, kind, expected, note, onlyWorkdays = true } = parsed.data;
  if (from > to) return res.status(400).json({ error: 'início depois do fim' });
  if (kind === 'custom' && expected == null) {
    return res.status(400).json({ error: 'jornada customizada exige minutos previstos' });
  }

  const dates = eachDay(from, to);
  if (dates.length > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `período muito longo (máx. ${MAX_RANGE_DAYS} dias)` });
  }

  const { schedule } = getSettings(req.user.id);
  const alvo = onlyWorkdays
    ? dates.filter((d) => (schedule[String(weekdayOf(d))]?.expected || 0) > 0)
    : dates;

  db.transaction(() => {
    for (const date of alvo) {
      upsert.run({
        uid: req.user.id,
        date,
        kind,
        expected: kind === 'custom' ? expected : null,
        note: note || null,
      });
    }
  })();
  res.json({ ok: true, days: alvo.length });
});

/** Remove todas as exceções do período. */
router.delete('/range', (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return res.status(400).json({ error: 'datas inválidas' });
  const info = db
    .prepare('DELETE FROM day_overrides WHERE user_id = ? AND date BETWEEN ? AND ?')
    .run(req.user.id, from, to);
  res.json({ ok: true, days: info.changes });
});

/** Cria ou substitui a exceção de um dia. */
router.put('/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) return res.status(400).json({ error: 'data inválida' });

  const schema = z.object({
    kind: z.enum(KINDS),
    expected: z.number().int().min(0).max(1440).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const { kind, expected, note } = parsed.data;
  if (kind === 'custom' && (expected == null)) {
    return res.status(400).json({ error: 'jornada customizada exige minutos previstos' });
  }

  upsert.run({
    uid: req.user.id,
    date: req.params.date,
    kind,
    expected: kind === 'custom' ? expected : null,
    note: note || null,
  });
  res.json({ ok: true });
});

/** Remove a exceção — o dia volta a seguir o schedule semanal. */
router.delete('/:date', (req, res) => {
  const info = db
    .prepare('DELETE FROM day_overrides WHERE user_id = ? AND date = ?')
    .run(req.user.id, req.params.date);
  if (info.changes === 0) return res.status(404).json({ error: 'não encontrado' });
  res.json({ ok: true });
});

export default router;
