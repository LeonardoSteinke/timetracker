import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { getSettings } from '../summary.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getSettings(req.user.id));
});

const daySchema = z.object({
  expected: z.number().int().min(0).max(1440),
  break: z.number().int().min(0).max(1440),
});

router.put('/', (req, res) => {
  const schema = z.object({
    tolerance_minutes: z.number().int().min(0).max(240),
    timezone: z.string().min(1).max(64),
    week_start: z.union([z.literal(0), z.literal(1)]),
    schedule: z.record(z.string(), daySchema),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const { tolerance_minutes, timezone, week_start, schedule } = parsed.data;
  db.prepare(
    `INSERT INTO settings (user_id, tolerance_minutes, timezone, week_start, schedule)
     VALUES (@uid, @tol, @tz, @ws, @sch)
     ON CONFLICT(user_id) DO UPDATE SET
       tolerance_minutes = @tol, timezone = @tz, week_start = @ws, schedule = @sch`
  ).run({
    uid: req.user.id,
    tol: tolerance_minutes,
    tz: timezone,
    ws: week_start,
    sch: JSON.stringify(schedule),
  });
  res.json(getSettings(req.user.id));
});

export default router;
