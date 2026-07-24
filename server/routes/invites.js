import express from 'express';
import { z } from 'zod';
import db, { INVITE_TTL_DAYS } from '../db.js';
import { requireAuth } from '../auth.js';
import { gerarConvite, listarDoUsuario, revogar, vagasUsadas } from '../invites.js';

const router = express.Router();
router.use(requireAuth);

/** Cota e convites do próprio usuário. */
function resumo(userId) {
  const quota = db.prepare('SELECT invite_quota FROM users WHERE id = ?').get(userId)?.invite_quota ?? 0;
  const usadas = vagasUsadas(userId);
  return {
    quota,
    usadas,
    restantes: Math.max(0, quota - usadas),
    ttlDays: INVITE_TTL_DAYS,
    invites: listarDoUsuario(userId),
  };
}

router.get('/', (req, res) => {
  res.json(resumo(req.user.id));
});

router.post('/', (req, res) => {
  const convite = gerarConvite(req.user.id);
  if (!convite) {
    return res.status(409).json({ code: 'sem_vaga', error: 'você já usou todos os seus convites' });
  }
  res.json({ code: convite.code, expires_at: convite.expires_at, ...resumo(req.user.id) });
});

router.delete('/:id', (req, res) => {
  const parsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  if (!revogar(parsed.data, req.user.id)) {
    return res.status(404).json({ error: 'convite não encontrado ou já resolvido' });
  }
  res.json(resumo(req.user.id));
});

export default router;
