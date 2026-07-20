# TimeTracker — Banco de Horas / Registro de Ponto

Clone web do app **Easy Time Tracker**. PWA instalável (iPhone/Android), 100%
responsivo, login multiusuário. Roda como **1 container** no homelab.

## Funcionalidades

- **Bater ponto**: entrada, saída e intervalos, com cronômetro ao vivo.
- **Hoje**: tempo trabalhado, quanto falta, tempo de intervalo e saldo do dia.
- **Semana**: trabalhado × previsto por dia, saldo diário e saldo da semana.
- **Histórico**: 7/30/90 dias + **saldo total do banco de horas**.
- **Configurações**: jornada por dia da semana, tolerância, fuso horário, início da semana, troca de senha.
- **PWA**: "Adicionar à tela inicial" funciona como app nativo (offline shell + ícones).

## Stack

- **Backend**: Node 20 + Express + better-sqlite3, bcrypt + JWT (cookie httpOnly), Zod, Helmet, rate-limit.
- **Frontend**: React + Vite + TypeScript + vite-plugin-pwa.
- **Container único**: build multi-stage (Vite → estático servido pelo Express). SQLite em `./data`.

## Configuração (`.env`)

```
PROJECT_NAME=timetracker
APP_PORT=3000
SUBDOMAIN=timetracker
TZ=America/Sao_Paulo
JWT_SECRET=<openssl rand -hex 32>
REGISTRATION_CODE=<código exigido no cadastro>
```

> O **primeiro usuário** cadastrado vira admin. O `REGISTRATION_CODE` impede
> cadastro aberto na internet — compartilhe apenas com quem deve ter acesso.

## Rodar

```bash
docker compose up -d --build      # sobe o container
docker compose logs -f            # logs
docker compose down               # para
```

Pelo bot Telegram: `/projects timetracker on|off`.

## Rede / exposição

- Container na rede externa `media_server_media_net` (sem publicar portas no host).
- Rota nginx: `timetracker.seudominio.com` → `http://timetracker:3000`
  (em `config/nginx-proxy/conf.d/projects.conf` do homelab).
- **Público** via Cloudflare Tunnel: adicionar hostname
  `timetracker.seudominio.com` → `http://nginx-proxy:80` no Zero Trust.

## Dados / backup

SQLite em `./data/timetracker.db` (ignorado pelo git). Incluir no backup.

## Desenvolvimento local

```bash
# backend
cd server && npm install && DATA_DIR=./data JWT_SECRET=dev REGISTRATION_CODE=dev npm run dev
# frontend (proxy /api → :3000)
cd web && npm install && npm run dev
```
