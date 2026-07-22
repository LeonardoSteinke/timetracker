# TimeTracker — Banco de Horas / Registro de Ponto

Clone web do app **Easy Time Tracker**. PWA instalável (iPhone/Android), 100%
responsivo, login multiusuário. Roda como **1 container** no homelab.

## Funcionalidades

- **Bater ponto**: entrada, saída e intervalos, com cronômetro ao vivo.
- **Hoje**: tempo trabalhado, quanto falta, tempo de intervalo e saldo do dia.
- **Semana**: trabalhado × previsto por dia, saldo diário e saldo da semana.
- **Histórico**: 7/30/90 dias + **saldo total do banco de horas**.
- **Editar dias passados**: tocar num dia em *Semana* ou *Histórico* abre `/dia/AAAA-MM-DD`,
  onde dá pra adicionar, corrigir horário/tipo ou apagar registros — para quando você
  esqueceu de bater o ponto.
- **Exceções de jornada**: marcar o dia como feriado, férias, atestado, folga (zeram o
  previsto, então o dia não gera saldo negativo) ou jornada especial com minutos à mão.
- **Exportar CSV**: botão no Histórico baixa o período (`;` como separador e BOM — abre
  direto no Excel pt-BR).
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
- Rota nginx em `config/nginx-proxy/conf.d/projects.conf`:
  `timetracker.seudominio.com` → `http://timetracker:3000`, nas portas **80 e 443**.
  As duas são necessárias: o MagicDNS do Tailscale resolve o domínio para o próprio
  host (`100.x.y.z`), então o navegador bate direto na 443 do nginx. Sem o bloco
  `listen 443` a requisição cai no `server_name _` do `default.conf` e abre o Nextcloud.
- Certificado é o interno do homelab (autoassinado) — o navegador avisa até você
  instalar o `homelab.pem` (`http://home.lab/ssl/cert.pem`).

### Acesso: Tailscale/LAN apenas

**Não está exposto à internet**, e isso é intencional. O registro DNS público de
`*.seudominio.com` aponta para `100.x.y.z`, que é CGNAT do Tailscale e não é
roteável de fora — vale para todos os serviços do homelab, não só este.

O `cloudflared` roda como **serviço systemd no host** (`systemctl status cloudflared`),
não em container, e o ingress fica em `/etc/cloudflared/config.yml` — não no painel
Zero Trust. Para tornar público um dia: adicionar o hostname naquele arquivo apontando
para `http://100.x.y.z:80` (o nginx não escuta em `localhost`) e trocar o registro
na Cloudflare de A para CNAME → `<tunnel-id>.cfargotunnel.com`, proxied.

## Dados / backup

SQLite em `./data/timetracker.db` (ignorado pelo git). Incluir no backup.

## Desenvolvimento local

```bash
# backend
cd server && npm install && DATA_DIR=./data JWT_SECRET=dev REGISTRATION_CODE=dev npm run dev
# frontend (proxy /api → :3000)
cd web && npm install && npm run dev
```
