import express from 'express';
import { z } from 'zod';
import db from '../db.js';
import { requireAuth } from '../auth.js';
import { pushHabilitado, chavePublica, enviar } from '../push.js';

const router = express.Router();

/**
 * O app consulta isto antes de oferecer o botão de ativar. `enabled: false`
 * significa servidor sem chaves VAPID — o recurso simplesmente não aparece.
 * Fora do requireAuth: a tela de login não precisa de sessão para descobrir
 * que o recurso existe.
 */
router.get('/config', (req, res) => {
  res.json({ enabled: pushHabilitado(), publicKey: chavePublica() });
});

router.use(requireAuth);

const subSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

/**
 * Registra (ou reatualiza) o aparelho. O endpoint é a identidade dele: se o
 * mesmo aparelho fizer login com outro usuário, a assinatura muda de dono em
 * vez de duplicar.
 */
router.post('/subscribe', (req, res) => {
  if (!pushHabilitado()) return res.status(503).json({ error: 'push não configurado no servidor' });

  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
  const { endpoint, keys } = parsed.data;

  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (@uid, @ep, @p256dh, @auth, @ua)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = @uid, p256dh = @p256dh, auth = @auth, user_agent = @ua`
  ).run({
    uid: req.user.id,
    ep: endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    ua: (req.get('user-agent') || '').slice(0, 200) || null,
  });

  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const parsed = z.object({ endpoint: z.string().url().max(1024) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(req.user.id, parsed.data.endpoint);
  res.json({ ok: true });
});

/** Dispara um aviso de teste em todos os aparelhos do usuário. */
router.post('/test', async (req, res) => {
  if (!pushHabilitado()) return res.status(503).json({ error: 'push não configurado no servidor' });

  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(req.user.id);
  if (subs.length === 0) return res.status(400).json({ error: 'nenhum aparelho ativado' });

  let entregues = 0;
  for (const sub of subs) {
    const { ok, morta } = await enviar(sub, {
      title: 'TimeTracker',
      body: 'Notificações ativadas neste aparelho. ✅',
      tag: 'teste',
    });
    if (ok) entregues++;
    if (morta) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
  }

  if (entregues === 0) return res.status(502).json({ error: 'não foi possível entregar o aviso' });
  res.json({ ok: true, entregues });
});

export default router;
