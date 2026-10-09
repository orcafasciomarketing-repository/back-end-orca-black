# Copa Backend — Documentação

## Visão Geral

Backend do Projeto Copa: um sistema de gamificação de vendas onde equipes de vendors competem entre si. Vendas cadastradas pelo admin são exibidas em tempo real em TVs via SSE e geram um placar por time.

**Stack:** Node.js, Express 5, MongoDB (Mongoose), Zod, JWT, bcrypt.

---

## Arquitetura

Cada feature segue a mesma estrutura em camadas:

```
features/<feature>/
  model/        → Schema do Mongoose (definição do documento no MongoDB)
  repository/   → Queries diretas ao banco (único lugar que toca o Mongoose)
  service/      → Lógica de negócio (orquestra repositórios, lança erros de domínio)
  controller/   → Recebe req/res, chama service, devolve resposta HTTP
  routes/       → Registra endpoints, aplica middlewares
  schemas/      → Schemas Zod para validação do body
```

O controller nunca acessa o repositório diretamente — sempre passa pelo service. O `req.data` é o body já validado pelo Zod (vem do `validateSchema` middleware).

---

## Variáveis de Ambiente

| Variável | Uso |
|---|---|
| `JWT_SECRET` | Assina e verifica access tokens JWT |
| `REFRESH_TOKEN_TTL_MS` | TTL do refresh token em milissegundos |
| `PEPPER` | String concatenada à senha antes do bcrypt (segurança extra) |
| `ROUND_ENCRYPTION` | Número de rounds do bcrypt (padrão: 15) |
| `NODE_ENV` | Se `"production"`, cookie do refresh token é marcado como `secure` |

---

## Rotas

### Auth — `/auth`

| Método | Endpoint | Middleware | Descrição |
|---|---|---|---|
| POST | `/auth/register` | validateSchema(RegisterSchema) | Cadastra admin |
| POST | `/auth/login` | validateSchema(LoginSchema) | Login, retorna access token |
| POST | `/auth/refresh` | — | Renova access token usando refresh token do cookie |

### Sales — `/sales`

| Método | Endpoint | Middleware | Descrição |
|---|---|---|---|
| GET | `/sales/admin` | — | Lista todas as vendas (com paginação opcional) |
| GET | `/sales/get` | — | Lista vendas da semana atual (com paginação opcional) |
| GET | `/sales/sales/events` | — | Conecta cliente SSE para receber eventos em tempo real |
| POST | `/sales/create` | authMiddleware, validateSchema | Cria venda e dispara SSE |
| PATCH | `/sales/update/:salesId` | authMiddleware, validateSchema | Edita venda existente |

Paginação via query params: `?page=1&limit=10`. Ambos precisam estar presentes para ativar a paginação.

### Analytics — `/analytics`

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/analytics/scoreboard?period=week\|all` | Placar de gols por time |
| GET | `/analytics/ranking?period=week\|all` | Top 3 vendors por job (Venda e Farmer) |
| GET | `/analytics/teams/:teamId` | Escalação completa de um time |

---

## Features

### Auth

**Fluxo de registro:**
1. Zod valida email, senha e confirmação de senha (superRefine compara os dois)
2. `userService.createUser` verifica se email já existe (ConflictError se sim)
3. Senha é hasheada com bcrypt + pepper e salva como `passwordHash`
4. Access token JWT (60min) e refresh token são gerados e retornados
5. Refresh token vai em cookie httpOnly

**Fluxo de login:**
1. Busca usuário por email (UnauthorizedError se não encontrar — mesmo erro proposital, não revela se email existe)
2. Busca usuário COM senha via `.select("+passwordHash")` — `passwordHash` tem `select: false` no schema, nunca sai em queries normais
3. `comparePassword` concatena pepper antes de comparar com bcrypt
4. Revoga todos os refresh tokens anteriores do usuário
5. Gera novos access token e refresh token

**Fluxo de refresh:**
1. Lê refresh token do cookie
2. `rotateTokenAtomic`: busca e revoga o token antigo em operação atômica (findOneAndUpdate) — garante que o token só seja usado uma vez
3. Cria novo refresh token com a mesma expiração do antigo (não estende o prazo)
4. Registra no campo `revokedBy` qual token substituiu o anterior (rastreabilidade)

---

### Sale

**Criação:**
1. Body validado pelo Zod: `vendor` (obrigatório), `sdrId` (opcional), `value` (opcional, number), `realizedAt` (obrigatório, coerce para Date)
2. Salvo no banco via `SalesRepository.create`
3. `broadcast(sale)` envia o objeto da venda para todos os clientes SSE conectados

**Cálculo da semana (`findByPeriod`):**
- Usa `getDay()` para achar o dia da semana (domingo = 0, convertido para 7)
- Calcula segunda-feira (`start`) e sexta-feira (`final`) da semana corrente
- Filtra vendas com `realizedAt` entre segunda e sexta

**Update:**
- Aceita qualquer combinação dos campos (todos opcionais no `UpdateSalesSchema`)
- `findByIdAndUpdate` com `{ new: true }` retorna o documento já atualizado

---

### SSE (Server-Sent Events)

**`sseManager.js`** mantém um array em memória (`responses`) com os objetos `res` de cada cliente conectado.

- `addClient(res, req)`: empurra `res` para o array. Quando a conexão fecha (`req.on("close")`), remove automaticamente do array para não acumular conexões mortas.
- `broadcast(eventData)`: percorre todos os `res` ativos e escreve o evento no formato `data: <json>\n\n` (padrão SSE).

O controller configura os headers corretos (`text/event-stream`, `no-cache`, `keep-alive`) antes de chamar `addClient`.

---

### Analytics

**Scoreboard (`getScoreboard`):**
- Carrega times, vendors e vendas em paralelo (`Promise.all`)
- Monta um `Map` de `vendorId → teamId` para lookup O(1)
- Percorre as vendas somando gols por time
- Retorna array ordenado por gols (decrescente)

**Ranking (`getVendorRank`):**
- Conta vendas por vendor com um `Map`
- Filtra vendors que têm pelo menos uma venda
- Separa em dois grupos pelo campo `job`: termina com `"Venda"` ou `"Farmer"`
- Retorna top 3 de cada grupo

**Escalação (`getTeamLineup`):**
- Busca vendors, SDRs e fans do time em paralelo
- Retorna `{ vendors, sdrs, fans }`

---

### Token (Refresh Token)

O modelo `RefreshToken` tem os campos:
- `token`: string aleatória de 32 bytes em hex (gerada com `crypto.randomBytes`)
- `revokedAt`: null enquanto válido, preenchido ao revogar
- `expiresAt`: prazo de expiração
- `revokedBy`: token que substituiu este (para auditoria)

**`rotateTokenAtomic`**: usa `findOneAndUpdate` com filtro `{ revokedAt: null, expiresAt: $gt: now }` — só revoga se o token estiver válido. Se não encontrar (token inválido ou expirado), retorna `null` e o service lança `TokenExpiredError`.

**`revokeAllTokens`**: chamado no login para invalidar sessões anteriores do usuário.

---

### Segurança de Senhas

- `hashPassword`: `bcrypt.hash(password + pepper, rounds)` — o pepper é uma string secreta do `.env` que torna ataques de dicionário a hashes vazados inúteis sem ela
- `comparePassword`: concatena o mesmo pepper antes de comparar
- `passwordHash` tem `select: false` no schema — nunca retorna em queries normais, só quando explicitamente solicitado via `.select("+passwordHash")`

---

### Middlewares

**`validateSchema(schema)`:**
- Chama `schema.safeParse(req.body)`
- Se inválido, lança `ValidationError` com a mensagem do primeiro erro Zod
- Se válido, coloca o dado limpo em `req.data` e chama `next()`
- Todos os schemas usam `strictObject` — campos extras no body causam erro de validação

**`authMiddleware`:**
- Lê `Authorization: Bearer <token>` do header
- Verifica o JWT com `jwt.verify` — lança exceção automaticamente se inválido/expirado
- O Express 5 captura o erro async e repassa ao handler global do `app.js`

---

### Tratamento de Erros

Handler global em `app.js`:
```js
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Erro interno do servidor";
  res.status(status).json({ error: message });
});
```

Funções de erro em `shared/errors.js` — todas criam um `Error` com `.status` anexado:
- `ConflictError` → 409
- `NotFoundError` → 404
- `UnauthorizedError` → 401
- `TokenExpiredError` → 401
- `ValidationError` → 400
- `DependencyError` → 409

Como o projeto usa **Express 5**, funções `async` em controllers propagam erros automaticamente ao handler global sem necessidade de try/catch.

---

## Dados Pré-populados (Seed)

Teams, Fans, Vendors e SDRs não têm rotas de CRUD — são carregados via seed e permanecem estáticos. O filtro do ranking (`job.endsWith("Venda")` e `job.endsWith("Farmer")`) depende dos valores de `job` definidos na seed.
