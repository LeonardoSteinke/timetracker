import express from 'express';
import { z } from 'zod';
import db, { DEFAULT_MIN_BREAK } from '../db.js';
import { requireAuth } from '../auth.js';
import { getSettings } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getSettings(req.user.id));
});

/** Fuso que o Intl aceita — um valor inválido quebraria todo cálculo de data. */
function fusoValido(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Liga/desliga como o SQLite guarda: 0 ou 1. */
const liga = z.union([z.literal(0), z.literal(1)]);

const daySchema = z.object({
  expected: z.number().int().min(0).max(1440),
  break: z.number().int().min(0).max(1440),
});

router.put('/', (req, res) => {
  const schema = z.object({
    tolerance_minutes: z.number().int().min(0).max(240),
    timezone: z.string().min(1).max(64).refine(fusoValido, 'fuso horário inválido'),
    week_start: z.union([z.literal(0), z.literal(1)]),
    // 0 = sem checagem de intervalo mínimo
    min_break_minutes: z.number().int().min(0).max(480).optional(),
    // Considera o intervalo mínimo ainda não cumprido na previsão de saída.
    predict_min_break: liga.optional(),
    // Avisos push. Opcionais e no mesmo 0/1 que o GET devolve, para o app poder
    // reenviar o objeto inteiro que recebeu.
    notify_end_of_day: liga.optional(),
    notify_end_lead_minutes: z.number().int().min(0).max(120).optional(),
    notify_break_done: liga.optional(),
    schedule: z.record(z.string(), daySchema),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const { tolerance_minutes, timezone, week_start, schedule } = parsed.data;
  const minBreak = parsed.data.min_break_minutes ?? DEFAULT_MIN_BREAK;
  // Campo ausente mantém o que já estava salvo.
  const atual = getSettings(req.user.id);
  const manter = (v, antes) => (v === undefined ? (antes ? 1 : 0) : v);

  db.prepare(
    `INSERT INTO settings (user_id, tolerance_minutes, timezone, week_start, min_break_minutes,
                           predict_min_break, notify_end_of_day, notify_end_lead_minutes,
                           notify_break_done, schedule)
     VALUES (@uid, @tol, @tz, @ws, @minb, @predb, @nEnd, @nLead, @nBreak, @sch)
     ON CONFLICT(user_id) DO UPDATE SET
       tolerance_minutes = @tol, timezone = @tz, week_start = @ws,
       min_break_minutes = @minb, predict_min_break = @predb, notify_end_of_day = @nEnd,
       notify_end_lead_minutes = @nLead, notify_break_done = @nBreak, schedule = @sch`
  ).run({
    uid: req.user.id,
    tol: tolerance_minutes,
    tz: timezone,
    ws: week_start,
    minb: minBreak,
    predb: manter(parsed.data.predict_min_break, atual.predict_min_break),
    nEnd: manter(parsed.data.notify_end_of_day, atual.notify_end_of_day),
    nLead: parsed.data.notify_end_lead_minutes ?? atual.notify_end_lead_minutes,
    nBreak: manter(parsed.data.notify_break_done, atual.notify_break_done),
    sch: JSON.stringify(schedule),
  });
  res.json(getSettings(req.user.id));
});

export default router;
