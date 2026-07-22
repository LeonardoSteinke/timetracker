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

**Funciona sem internet** — instalado como PWA, o app abre e deixa bater o ponto
mesmo offline: o registro fica numa fila local e sobe sozinho quando a conexão
volta. Reenvio não duplica nada (cada ponto leva um id gerado no cliente).

**Multiusuário** — cada pessoa tem seus próprios registros, jornada e fuso.
Cadastro protegido por código de convite.

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
| `REGISTRATION_CODE` | Código exigido no cadastro — `openssl rand -hex 12` |

O `REGISTRATION_CODE` é o que impede cadastro aberto se a instância for exposta à
internet. Compartilhe só com quem deve ter acesso, e troque depois que todos
estiverem cadastrados (editar o `.env` e `docker compose up -d`).

Jornada por dia da semana, tolerância, intervalo mínimo, fuso e início da semana
são configurados por usuário, dentro do app, em **Ajustes**.

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

## Dados e backup

Tudo vive em `./data/timetracker.db`, ignorado pelo git. Inclua esse diretório na
sua rotina de backup — é o único estado da aplicação.

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
  routes/           punches, reports, settings, overrides
web/src/
  pages/            Dashboard, Week, History, DayEditor, Settings, Login
  api.ts            cliente HTTP e tipos compartilhados
  offline.ts        fila de pontos e retrato do dia para uso sem conexão
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
| `GET` | `/api/settings` · `PUT` | Jornada, tolerância, intervalo mínimo, fuso, início da semana |
| `GET` | `/api/overrides?from=&to=` | Exceções de jornada |
| `PUT` | `/api/overrides/:date` | Define feriado/férias/atestado/folga/especial |
| `DELETE` | `/api/overrides/:date` | Remove a exceção |

## Licença

MIT.
