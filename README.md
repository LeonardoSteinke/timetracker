# TimeTracker

Registro de ponto e banco de horas, self-hosted. Um container, um binário de
banco, zero dependências externas — sobe em qualquer lugar que rode Docker.

PWA instalável: adicionado à tela inicial do iPhone ou Android, abre em tela
cheia e se comporta como app nativo.

---

## Por que existe

Apps de ponto costumam ser SaaS pago, com seus horários de trabalho num servidor
de terceiros. Este roda na sua máquina, guarda tudo num arquivo SQLite que você
pode copiar, e não fala com nenhum serviço externo.

O cálculo é o de banco de horas de verdade: cada dia tem uma jornada prevista, o
saldo diário é o que passou ou faltou, e o saldo acumulado é a soma de tudo.
Tolerância configurável evita que cinco minutos a menos virem dívida.

## Funcionalidades

**Bater ponto** — entrada, saída e intervalos, com cronômetro ao vivo do tempo
trabalhado no dia.

**Hoje** — quanto já trabalhou, quanto falta para fechar a jornada, tempo de
intervalo e saldo do dia. O intervalo começa a contar assim que se bate a saída
no meio da jornada, e o app avisa se a volta acontecer antes do mínimo
configurado (30 min por padrão).

**Semana** — trabalhado × previsto por dia em barras comparativas, saldo diário e
total da semana, com navegação entre semanas.

**Histórico** — 7, 30 ou 90 dias, com o saldo acumulado do banco de horas.

**Editar dias passados** — esqueceu de bater o ponto? Toque em qualquer dia na
Semana ou no Histórico para abrir a edição: adicionar, corrigir horário ou tipo,
e remover registros.

**Exceções de jornada** — marque o dia como feriado, férias, atestado ou folga e
a jornada prevista vai a zero, então o dia não gera saldo negativo. Ou defina uma
jornada especial com os minutos na mão.

**Exportar CSV** — baixa o período do histórico com entrada, saída, trabalhado,
previsto e saldo por dia. Separador `;` e BOM, para abrir direto no Excel em
português.

**Avisa no celular** — notificação quando a jornada do dia fecha (com
antecedência configurável) e quando o intervalo mínimo é cumprido e já dá para
voltar. Chega com o app fechado, via Web Push. Ligar é por aparelho, em
**Ajustes → Notificações**; escolher quais avisos é por usuário.

**Funciona sem internet** — instalado como PWA, o app abre e deixa bater o ponto
mesmo offline: o registro fica numa fila local e sobe sozinho quando a conexão
volta. Reenvio não duplica nada (cada ponto leva um id gerado no cliente).

**Multiusuário** — cada pessoa tem seus próprios registros, jornada e fuso.

**Convites e administração** — quem entra com o código do `.env` vira **admin
master**: gerencia todos os usuários, ajusta quantas pessoas cada um pode
convidar, redefine senhas e exclui contas. Todo mundo mais entra por **convite**
gerado dentro do app — cada usuário pode trazer 5 pessoas por padrão, e o convite
vale para uma pessoa só, por 7 dias.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node 20, Express, better-sqlite3 |
| Auth | bcrypt + JWT em cookie `httpOnly`, rate limit no login |
| Validação | Zod em toda entrada da API |
| Frontend | React, TypeScript, Vite, vite-plugin-pwa |
| Banco | SQLite (arquivo único, modo WAL) |
| Deploy | Um container, build multi-stage |

O Vite compila o frontend no primeiro estágio do Dockerfile; o segundo estágio
roda o Express, que serve a API e os estáticos do build. Não há servidor web
separado nem processo de banco — a imagem final é Node e um arquivo `.db`.

### Fusos horários

Todo instante é gravado em ISO 8601 UTC. A conversão para o fuso do usuário
acontece **inteiramente no servidor**: o cliente envia data e hora locais
(`{ date: "2026-06-10", time: "09:00" }`) e recebe as horas já resolvidas. Assim
editar um ponto de um dia passado dá o mesmo resultado independente do fuso do
aparelho, e as bordas de horário de verão são tratadas num lugar só
(`server/time.js`).

## Rodar

Requer Docker com o plugin Compose.

```bash
cp .env.example .env
# edite o .env: gere o JWT_SECRET e defina o código de convite
docker compose up -d --build
```

O primeiro usuário cadastrado vira admin.

```bash
docker compose logs -f     # logs
docker compose down        # parar
```

### Configuração

Tudo pelo `.env`:

| Variável | Descrição |
|---|---|
| `PROJECT_NAME` | Nome do container |
| `APP_PORT` | Porta interna da aplicação |
| `TZ` | Fuso padrão de novos usuários |
| `JWT_SECRET` | Assina os cookies de sessão — `openssl rand -hex 32` |
| `REGISTRATION_CODE` | Código que cria **admin master** — `openssl rand -hex 12` |
| `VAPID_*` | Opcional: chaves das notificações push (geradas sozinhas, veja abaixo) |

Jornada por dia da semana, tolerância, intervalo mínimo, fuso e início da semana
são configurados por usuário, dentro do app, em **Ajustes**. Conta nova começa com
8h48 de segunda a sexta (as 44h semanais da CLT), 10 min de tolerância e 30 min de
intervalo mínimo.

#### Quem entra e como

Há dois níveis de acesso e dois jeitos de se cadastrar:

- **Admin master** — quem usa o `REGISTRATION_CODE` do `.env`. Enxerga a tela de
  usuários: cota de convites de cada um, redefinir senha, promover e excluir
  contas. Guarde esse código como segredo e troque quando quiser fechar a porta
  (editar o `.env` e `docker compose up -d`).
- **Usuário comum** — entra por um convite gerado dentro do app, em **Ajustes →
  Convites**. Cada convite vale para uma pessoa, expira em 7 dias e sai da cota de
  quem convidou (5 por padrão, ajustável por usuário pelo master). Convite aceito
  ocupa a vaga para sempre; revogar ou deixar vencer um não usado devolve a vaga.
  Revogar apaga o convite, e o convite some junto com a conta que entrou por ele —
  a lista mostra só o que ainda vale ou ainda existe.

O primeiro cadastro de uma instância vazia vira master mesmo sem código, para dar
partida. Redefinir a senha de alguém (pelo master ou pela própria pessoa) derruba
as sessões abertas nos outros aparelhos.

### Rede

O `docker-compose.yml` deste repositório coloca o container numa rede Docker
externa e **não publica porta no host** — ele assume um proxy reverso na frente,
que é como roda no meu homelab. Para subir de forma isolada, troque o bloco
`networks` por uma publicação de porta:

```yaml
    ports:
      - "3000:3000"
```

E acesse em `http://localhost:3000`.

#### Atrás de um proxy reverso

O Express roda com `trust proxy`, e o cookie de sessão marca `secure` conforme o
`X-Forwarded-Proto` recebido — então funciona tanto em HTTP na rede local quanto
em HTTPS publicado. Encaminhe os headers de sempre:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name timetracker.seudominio.com.br;

    ssl_certificate     /caminho/cert.pem;
    ssl_certificate_key /caminho/key.pem;

    location / {
        proxy_pass http://timetracker:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
    }
}
```

Declare os dois `listen`. Se o domínio resolver para o host também na rede
interna (split DNS, Tailscale MagicDNS), o navegador vai bater direto na 443 — e
sem esse bloco a requisição cai no `default_server` e abre outro serviço.

**Com outro proxy na frente** (Cloudflare Tunnel, por exemplo), `$scheme` passa a
ser o do salto interno em HTTP, e repassá-lo cru faz a aplicação achar que a
conexão é insegura — o cookie de sessão sai sem a flag `Secure`. Prefira o
protocolo que o cliente usou de verdade, caindo no `$scheme` quando não houver
nenhum header:

```nginx
map $http_x_forwarded_proto $client_proto {
    default $scheme;
    "~."    $http_x_forwarded_proto;
}
# ... e no location:
proxy_set_header X-Forwarded-Proto $client_proto;
```

Vale conferir também se o CDN respeita os headers de cache da origem: a
Cloudflare, por padrão, troca o `no-cache` de qualquer `.js` por um `max-age` de
4 h (`Browser Cache TTL`). O `sw.js` é revalidado pelo navegador de qualquer
forma, e os scripts que ele importa levam o id do build na URL — mas se você
servir outros arquivos sem hash no nome, ajuste para *Respect Existing Headers*.

### Notificações push

As chaves VAPID (a identidade do servidor perante o serviço de push) são geradas
na primeira boot e guardadas em `data/vapid.json`, junto do banco — nada para
configurar. Apagar esse arquivo derruba todas as assinaturas já feitas nos
aparelhos; para gerenciar as chaves à mão, defina `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no `.env`, que têm prioridade.

Dois requisitos são do navegador, não do app:

- **HTTPS com certificado válido.** Sem isso o navegador não registra o service
  worker, e sem service worker não há push (nem modo offline). Certificado
  self-signed ou acesso por HTTP puro não servem — na prática, publique atrás de
  um proxy com certificado de verdade (Let's Encrypt, Cloudflare Tunnel).
- **No iPhone, o app instalado na tela de início** (iOS 16.4+). No Safari em aba
  o pedido de permissão nem aparece. No Android funciona também pela aba.

O agendador roda no próprio processo do backend: a cada minuto ele recalcula o
dia de quem tem aparelho assinado e dispara o aviso que acabou de vencer. Não há
fila de agendamentos — editar um ponto, mudar a jornada ou marcar um feriado já
valem no minuto seguinte.

## Dados e backup

Tudo vive em `./data/timetracker.db`, ignorado pelo git. Inclua esse diretório na
sua rotina de backup — é o único estado da aplicação.

O servidor cria automaticamente um snapshot consistente por dia em
`./data/backups/`. São mantidos apenas os três arquivos diários mais recentes;
a verificação roda ao iniciar e, depois, a cada hora para não depender do
processo permanecer ligado em um horário exato.

O SQLite roda em modo WAL, então há também `-wal` e `-shm` ao lado. Para uma
cópia consistente com o container no ar, prefira:

```bash
docker compose exec app node -e \
  "require('better-sqlite3')('/app/data/timetracker.db')\
   .exec(\"VACUUM INTO '/app/data/backup.db'\")"
```

Isso consolida o WAL e escreve um `.db` único e íntegro, sem parar a aplicação.

## Desenvolvimento

```bash
# backend — porta 3000
cd server && npm install
DATA_DIR=./data JWT_SECRET=dev REGISTRATION_CODE=dev npm run dev

# frontend — porta 5173, com proxy de /api para o backend
cd web && npm install && npm run dev
```

### Estrutura

```
server/
  index.js          Express, estáticos e fallback da SPA
  db.js             schema SQLite e migrações idempotentes
  time.js           conversão de fuso e cálculo de tempo trabalhado
  summary.js        resumo por dia, previsto e saldo acumulado
  auth.js           cadastro, login, JWT
  push.js           chaves VAPID e envio de Web Push
  notify.js         agendador dos avisos (roda a cada minuto)
  invites.js        convites: cota, validade e consumo
  routes/           punches, reports, settings, overrides, push, invites, admin
web/
  public/push-sw.js handlers de push anexados ao service worker do Workbox
  src/pages/        Dashboard, Week, History, DayEditor, Settings, Users, Login
  src/api.ts        cliente HTTP e tipos compartilhados
  src/offline.ts    fila de pontos e retrato do dia para uso sem conexão
  src/push.ts       assinatura de notificações do aparelho
```

### API

Todas as rotas exigem o cookie de sessão, exceto cadastro e login.

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/register` | Cadastro (exige o código de convite) |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/punches/today` | Estado atual e resumo de hoje |
| `POST` | `/api/punches` | Registra ponto (agora, ISO, ou `date`+`time`; `clientId` torna o envio idempotente) |
| `PATCH` | `/api/punches/:id` | Corrige horário, tipo ou observação |
| `DELETE` | `/api/punches/:id` | Remove um ponto |
| `GET` | `/api/reports/day?date=` | Detalhe de um dia, com horas locais |
| `GET` | `/api/reports/week?start=` | Semana de 7 dias |
| `GET` | `/api/reports/range?from=&to=` | Intervalo arbitrário |
| `GET` | `/api/reports/total` | Saldo acumulado |
| `GET` | `/api/reports/export.csv?from=&to=` | Exportação CSV |
| `PATCH` | `/api/auth/me` | Altera o nome de exibição (o nome de usuário não muda) |
| `GET` | `/api/settings` · `PUT` | Jornada, tolerância, intervalo mínimo, fuso, início da semana |
| `GET` | `/api/overrides?from=&to=` | Exceções de jornada |
| `PUT` | `/api/overrides/:date` | Define feriado/férias/atestado/folga/especial |
| `DELETE` | `/api/overrides/:date` | Remove a exceção |
| `GET` | `/api/push/config` | Chave pública VAPID (dispensa sessão) |
| `POST` | `/api/push/subscribe` · `/unsubscribe` | Liga/desliga os avisos neste aparelho |
| `POST` | `/api/push/test` | Dispara um aviso de teste |
| `GET` | `/api/invites` · `POST` · `DELETE /:id` | Meus convites: cota, gerar, revogar |
| `GET` | `/api/admin/users` | Lista de usuários (só admin master) |
| `PATCH` | `/api/admin/users/:id` | Cota de convites e nível de acesso |
| `POST` | `/api/admin/users/:id/password` | Redefine a senha de um usuário |
| `DELETE` | `/api/admin/users/:id` | Exclui a conta e tudo que é dela |

## Licença

MIT.
