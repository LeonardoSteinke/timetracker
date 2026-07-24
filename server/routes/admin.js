// Administração de usuários — só para admin master.

import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth, requireAdmin, agoraEmSegundos } from '../auth.js';
import { vagasUsadas } from '../invites.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const idSchema = z.coerce.number().int().positive();

/**
 * Quantos masters existem. O invariante é "sempre sobra pelo menos um": na
 * prática quem o garante é a proibição de mexer na própria conta, mas as
 * checagens abaixo o afirmam explicitamente, para uma regra nova não derrubá-lo
 * sem querer.
 */
function totalMasters() {
  return db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1').get().n;
}

function usuario(id) {
  return db.prepare('SELECT id, name, username, is_admin, invite_quota, created_at FROM users WHERE id = ?').get(id);
}

/** Lista com o que a tela de administração mostra de cada um. */
router.get('/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.username, u.is_admin, u.invite_quota, u.created_at,
              (SELECT COUNT(*) FROM punches p WHERE p.user_id = u.id)      AS punches,
              (SELECT iu.name FROM invites i
                 JOIN users iu ON iu.id = i.inviter_id
                WHERE i.invitee_id = u.id)                                 AS invited_by
         FROM users u
        ORDER BY u.is_admin DESC, u.created_at`
    )
    .all();
  res.json(rows.map((u) => ({ ...u, invites_used: vagasUsadas(u.id) })));
});

/** Cota de convites e nível de acesso. */
router.patch('/users/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const body = z
    .object({
      invite_quota: z.number().int().min(0).max(1000).optional(),
      is_admin: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: 'dados inválidos' });

  const alvo = usuario(id.data);
  if (!alvo) return res.status(404).json({ error: 'usuário não encontrado' });

  const { invite_quota, is_admin } = body.data;
  if (is_admin !== undefined && is_admin !== alvo.is_admin) {
    // Rebaixar a si mesmo tira o acesso à própria tela no meio do caminho, e
    // rebaixar o último master deixa a instância sem quem administra.
    if (alvo.id === req.user.id) {
      return res.status(400).json({ error: 'você não pode mudar o seu próprio nível de acesso' });
    }
    if (is_admin === 0 && alvo.is_admin === 1 && totalMasters() <= 1) {
      return res.status(400).json({ error: 'é o único admin master — promova outro antes' });
    }
  }

  db.prepare('UPDATE users SET invite_quota = ?, is_admin = ? WHERE id = ?').run(
    invite_quota ?? alvo.invite_quota,
    is_admin ?? alvo.is_admin,
    alvo.id
  );
  res.json({ ...usuario(alvo.id), invites_used: vagasUsadas(alvo.id) });
});

/** Redefine a senha de alguém. As sessões abertas dessa pessoa caem junto. */
router.post('/users/:id/password', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const body = z.object({ password: z.string().min(6).max(200) }).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: 'dados inválidos' });

  const alvo = usuario(id.data);
  if (!alvo) return res.status(404).json({ error: 'usuário não encontrado' });

  db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
    .run(bcrypt.hashSync(body.data.password, 10), agoraEmSegundos(), alvo.id);
  res.json({ ok: true });
});

/**
 * Exclui a conta. Pontos, ajustes, exceções, assinaturas de push e o convite
 * por onde a pessoa entrou vão junto, pelo ON DELETE CASCADE — quem a convidou
 * recupera a vaga.
 */
router.delete('/users/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'dados inválidos' });

  const alvo = usuario(id.data);
  if (!alvo) return res.status(404).json({ error: 'usuário não encontrado' });
  if (alvo.id === req.user.id) {
    return res.status(400).json({ error: 'você não pode excluir a sua própria conta' });
  }
  if (alvo.is_admin && totalMasters() <= 1) {
    return res.status(400).json({ error: 'é o único admin master — promova outro antes' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(alvo.id);
  res.json({ ok: true });
});

export default router;
