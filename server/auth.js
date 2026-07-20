import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import db, { DEFAULT_SCHEDULE } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET ausente ou fraco — defina no .env');
}
const REGISTRATION_CODE = process.env.REGISTRATION_CODE || '';
const COOKIE = 'tt_session';
const TOKEN_TTL = '30d';

const isProd = process.env.NODE_ENV === 'production';
function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,          // via Cloudflare Tunnel o tráfego chega em HTTPS
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function sign(user) {
  return jwt.sign({ uid: user.id, name: user.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Middleware: exige sessão válida; injeta req.user. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'não autenticado' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, username, is_admin FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'sessão inválida' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'sessão expirada' });
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'muitas tentativas, tente novamente mais tarde' },
});

const credsSchema = z.object({
  username: z.string().trim().min(3).max(40),
  password: z.string().min(6).max(200),
});
const registerSchema = credsSchema.extend({
  name: z.string().trim().min(1).max(80),
  code: z.string(),
});

const router = express.Router();

router.post('/register', loginLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
  const { name, username, password, code } = parsed.data;

  if (REGISTRATION_CODE && code !== REGISTRATION_CODE) {
    return res.status(403).json({ error: 'código de cadastro inválido' });
  }
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'nome de usuário já em uso' });

  const isFirst = db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0;
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, username, password_hash, is_admin) VALUES (?,?,?,?)')
    .run(name, username, hash, isFirst ? 1 : 0);

  db.prepare('INSERT INTO settings (user_id, schedule) VALUES (?, ?)')
    .run(info.lastInsertRowid, JSON.stringify(DEFAULT_SCHEDULE));

  const user = { id: info.lastInsertRowid, name };
  res.cookie(COOKIE, sign(user), cookieOpts());
  res.json({ id: user.id, name, username, is_admin: isFirst ? 1 : 0 });
});

router.post('/login', loginLimiter, (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
  const { username, password } = parsed.data;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'usuário ou senha incorretos' });
  }
  res.cookie(COOKIE, sign(user), cookieOpts());
  res.json({ id: user.id, name: user.name, username: user.username, is_admin: user.is_admin });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

router.post('/password', requireAuth, (req, res) => {
  const schema = z.object({
    current: z.string(),
    next: z.string().min(6).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(parsed.data.current, row.password_hash)) {
    return res.status(403).json({ error: 'senha atual incorreta' });
  }
  const hash = bcrypt.hashSync(parsed.data.next, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

export default router;
