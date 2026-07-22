import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ['holiday', 'vacation', 'sick', 'dayoff', 'custom'];

/** Exceções num intervalo. ?from=&to= (YYYY-MM-DD). */
router.get('/', (req, res) => {
  const from = String(req.query.from || '0000-01-01');
  const to = String(req.query.to || '9999-12-31');
  const rows = db
    .prepare('SELECT date, kind, expected, note FROM day_overrides WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date')
    .all(req.user.id, from, to);
  res.json({ overrides: rows });
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

  db.prepare(
    `INSERT INTO day_overrides (user_id, date, kind, expected, note)
     VALUES (@uid, @date, @kind, @expected, @note)
     ON CONFLICT(user_id, date) DO UPDATE SET
       kind = @kind, expected = @expected, note = @note`
  ).run({
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
