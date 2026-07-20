# ─── Stage 1: build do frontend (Vite/React) ─────────────────────────────────
FROM node:20-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build          # gera /web/dist

# ─── Stage 2: runtime do backend (Express + SQLite) ──────────────────────────
# Debian slim (glibc) — o binário pré-compilado do better-sqlite3 é glibc.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
# artefatos do frontend servidos estaticamente pelo Express
COPY --from=web /web/dist ./web/dist

RUN mkdir -p /app/data
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
