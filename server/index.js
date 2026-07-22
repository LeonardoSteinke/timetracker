import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './auth.js';
import punchesRouter from './routes/punches.js';
import settingsRouter from './routes/settings.js';
import reportsRouter from './routes/reports.js';
import overridesRouter from './routes/overrides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Atrás do nginx-proxy / Cloudflare Tunnel — confia no proxy para IP e secure cookie
app.set('trust proxy', 1);

app.use(
  helmet({
    // CSP relaxada: SPA própria, sem recursos externos. Ajustável conforme necessidade.
    contentSecurityPolicy: false,
  })
);
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'timetracker' }));

app.use('/api/auth', authRouter);
app.use('/api/punches', punchesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/overrides', overridesRouter);

// ── Frontend (build do Vite) ──────────────────────────────────────────────
const webDir = path.join(__dirname, 'web', 'dist');
app.use(express.static(webDir));

// SPA fallback: qualquer rota não-API devolve o index.html
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TimeTracker rodando na porta ${PORT}`);
});
