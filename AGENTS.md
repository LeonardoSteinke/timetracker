# TimeTracker — guia para manutenção

## Visão geral

O TimeTracker é um PWA self-hosted para registro de ponto e banco de horas. O frontend React fica em `web/`; o backend Express e o SQLite ficam em `server/`. O build de produção é feito em duas etapas pelo `Dockerfile`: o Vite gera os arquivos estáticos e o Express serve tanto `/api` quanto o frontend.

## Frontend

- Entrada: `web/src/main.tsx`; autenticação global: `web/src/auth.tsx`.
- Rotas e menu inferior: `web/src/App.tsx`.
- Telas: `web/src/pages/`; configurações são subrotas em `pages/Settings/`.
- API tipada: `web/src/api.ts`; cálculos e formatação: `web/src/util.ts`.
- Offline: `web/src/offline.ts` mantém cache e fila local idempotente.
- PWA/instalação/push: `web/src/install.tsx`, `push.ts` e `version.ts`.
- O CSS é global e centralizado em `web/src/styles.css`.

O shell reserva espaço para a navegação inferior fixa. A barra considera `env(safe-area-inset-bottom)` e as páginas consideram o safe area superior. A largura útil padrão é `--maxw: 560px`; regras para 420 px e 350 px tratam celulares estreitos. Ao criar uma tela, use `.page` como raiz e não aplique uma segunda compensação para o menu inferior.

## Backend e dados

- Entrada e montagem das rotas: `server/index.js`.
- Banco, schema e migrações incrementais: `server/db.js`.
- Autenticação/cookies/JWT: `server/auth.js`.
- Regras de tempo e fuso: `server/time.js`; instantes são UTC no banco e datas e horas locais são resolvidas no servidor.
- Cálculo diário/semanal: `server/summary.js`.
- Rotas ficam em `server/routes/`; notificações em `notify.js` e `push.js`.
- `server/backup.js` cria um snapshot diário em `data/backups/` e conserva os
  três dias mais recentes. A pasta não é versionada porque fica dentro de `data/`.

O estado persistente de produção é o SQLite em `data/`. Nunca altere a regra de fuso apenas no cliente: edição de pontos, agrupamento por dia e horário de verão precisam continuar centralizados no servidor.

## Regras importantes

- Pontos alternam entrada/saída pela ordem cronológica; o tipo visual deriva da posição. A fila offline envia `clientId`, evitando duplicação no reenvio.
- O frontend replica alguns cálculos para atualização ao vivo e modo offline; qualquer mudança nessas regras deve permanecer equivalente a `summary.js`.
- A sessão usa cookie `httpOnly`; falha de rede preserva o usuário em cache, enquanto `401` limpa a sessão local.
- Preserve safe areas do iOS, `100dvh`, inputs com no mínimo 16 px e ausência de overflow horizontal ao mexer em responsividade.

## Verificação

Antes de concluir mudanças, rode `cd server && npm test` e
`cd web && npm run build`. Confira visualmente as larguras de 320, 360, 390 e
560 px e os modos claro/escuro quando mexer em CSS.
