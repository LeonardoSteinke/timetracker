import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { migrateAlternatingPunches, migrateTruncateSeconds } from './normalize.js';
import authRouter from './auth.js';
import punchesRouter from './routes/punches.js';
import settingsRouter from './routes/settings.js';
import reportsRouter from './routes/reports.js';
import overridesRouter from './routes/overrides.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrateAlternatingPunches();
migrateTruncateSeconds();

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

// ── Versão do build ───────────────────────────────────────────────────────
// O frontend carrega o id embutido no próprio bundle e compara com este. Se
// divergir, ele limpa o cache do service worker e recarrega (src/version.ts).
const webDir = path.join(__dirname, 'web', 'dist');
const BUILD_ID = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(webDir, 'version.json'), 'utf8')).build;
  } catch {
    return 'dev';
  }
})();

app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ build: BUILD_ID });
});

app.use('/api/auth', authRouter);
app.use('/api/punches', punchesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/overrides', overridesRouter);

// ── Frontend (build do Vite) ──────────────────────────────────────────────
// Assets com hash no nome podem ser cacheados para sempre; o resto (index.html,
// sw.js, manifest, version.json) precisa revalidar sempre, senão o navegador
// segura a versão antiga mesmo depois de um deploy novo.
app.use(
  express.static(webDir, {
    setHeaders(res, filePath) {
      const immutable = /[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|svg)$/.test(path.basename(filePath));
      res.set('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  })
);

// SPA fallback: qualquer rota não-API devolve o index.html
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(webDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TimeTracker rodando na porta ${PORT}`);
});
