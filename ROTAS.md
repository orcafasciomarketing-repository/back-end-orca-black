# Rotas da API

Todas as rotas são montadas em [app.js](app.js). Respostas de sucesso (exceto `/auth` e o webhook) seguem o formato:

```json
{ "success": true, "data": ..., "message": "..." }
```

Erros passam pelo handler global e retornam `{ "error": "mensagem" }` com o status correspondente.

## Resumo

| Método | Rota | Acesso | Parâmetros |
|---|---|---|---|
| POST | `/auth/register` | Pública | body |
| POST | `/auth/login` | Pública | body |
| POST | `/auth/refresh` | Pública (exige cookie) | cookie `refreshToken` |
| GET | `/sales/admin` | **Privada** (JWT) | query `page`, `limit` |
| GET | `/sales/get` | Pública | query `page`, `limit` |
| GET | `/sales/get/:vendorId` | **Privada** (JWT) | path `vendorId` |
| GET | `/sales/events` | Pública | — |
| POST | `/sales/webhook/deal` | Protegida por segredo | header `webhook_secret`, body |
| GET | `/vendor/list` | Pública | — |
| GET | `/sdr/list` | Pública | — |
| GET | `/analytics/goal` | Pública | — |
| GET | `/analytics/scoreboard` | Pública | query `period` |
| GET | `/analytics/scoreboard/last-week` | Pública | — |
| GET | `/analytics/ranking` | Pública | query `period`, `vendorDepartment` |
| GET | `/analytics/ranking/last-week` | Pública | query `vendorDepartment` |
| GET | `/analytics/sdr-ranking` | Pública | query `period` |
| GET | `/analytics/sdr-ranking/last-week` | Pública | — |
| GET | `/public/*` | Pública (arquivos estáticos) | path do arquivo |

## Autenticação

Rotas **privadas** passam pelo [authMiddleware](middlewares/authMidleware.js) e exigem o header:

```
Authorization: Bearer <token>
```

O `token` vem da resposta de `/auth/login`, `/auth/register` ou `/auth/refresh` e expira em **60 minutos**.

- Sem header → `401 Token não encontrado`
- Token inválido ou expirado → `401 Token inválido ou expirado`

---

## Auth — `/auth`

### `POST /auth/register` — Pública

Cria um usuário e já devolve os tokens. Grava o cookie `refreshToken` (httpOnly).

**Body** (validado por `RegisterSchema`, não aceita campos extras):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | sim | E-mail válido. É convertido para minúsculas e sem espaços. |
| `password` | string | sim | Senha com no mínimo 6 caracteres. |
| `passwordConfirmation` | string | sim | Precisa ser igual a `password`, senão retorna "Senhas são diferentes". |

**Resposta:** `201 { user, token }`

### `POST /auth/login` — Pública

Autentica o usuário. Grava o cookie `refreshToken` (httpOnly).

**Body** (validado por `LoginSchema`, não aceita campos extras):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | sim | E-mail válido (convertido para minúsculas). |
| `password` | string | sim | Senha com no mínimo 6 caracteres. |

**Resposta:** `200 { user, token }`

### `POST /auth/refresh` — Pública (exige cookie)

Gera um novo access token a partir do refresh token e renova o cookie.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `refreshToken` | cookie | Enviado automaticamente pelo navegador (o front precisa usar `credentials: "include"`). |

**Resposta:** `200 { user, token }`

---

## Vendas — `/sales`

### `GET /sales/admin` — Privada

Lista todas as vendas.

**Query** (opcionais — a paginação só é aplicada se **os dois** forem enviados):

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `page` | número | Página desejada, começando em 1. |
| `limit` | número | Quantidade de vendas por página. |

### `GET /sales/get` — Pública

Lista as vendas da **semana atual** (segunda 00:00 até domingo 23:59, horário de São Paulo).

**Query:** mesmos `page` e `limit` opcionais de `/sales/admin`.

### `GET /sales/get/:vendorId` — Privada

Lista as vendas de um vendedor.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `vendorId` | path | `_id` do vendedor no banco (o mesmo que vem em `/vendor/list`). |

### `GET /sales/events` — Pública

Abre uma conexão **SSE** (`text/event-stream`) para receber eventos em tempo real. Cada evento chega como `data: <json>`. Sem parâmetros.

> Hoje o `broadcast` de nova venda está comentado em [salesService.js](features/sale/service/salesService.js), então nenhum evento é enviado.

### `POST /sales/webhook/deal` — Protegida por segredo

Recebe os eventos de negociação da RD Station. Não usa JWT: valida o header contra a variável `WEBHOOK_SECRET` do `.env`.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `webhook_secret` | header | Precisa ser igual a `WEBHOOK_SECRET`, senão retorna `401`. |
| body | JSON | Payload da RD. Campos usados (dentro de `document`): `id`, `name`, `amount_total`, `deal_stage.id`, `updated_at`, `user.id`, `status` e `deal_custom_fields` (campo de passagem do SDR). |

**Resposta:** `200 { received: true }`

---

## Vendedores — `/vendor`

### `GET /vendor/list` — Pública

Lista todos os vendedores. Sem parâmetros.

---

## SDRs — `/sdr`

### `GET /sdr/list` — Pública

Lista todos os SDRs. Sem parâmetros.

---

## Analytics — `/analytics`

Valores inválidos ou ausentes nos parâmetros **não geram erro**: caem no valor padrão.

### `GET /analytics/goal` — Pública

Retorna a meta da Black Friday e o progresso. Sem parâmetros.

### `GET /analytics/scoreboard` — Pública

Placar geral.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |

### `GET /analytics/scoreboard/last-week` — Pública

Placar da semana passada. Sem parâmetros.

### `GET /analytics/ranking` — Pública

Ranking de vendedores.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |
| `vendorDepartment` | query | `farm` \| `sales` | `sales` | Funil do vendedor: farm ou vendas. |

### `GET /analytics/ranking/last-week` — Pública

Ranking de vendedores da semana passada.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `vendorDepartment` | query | `farm` \| `sales` | `sales` | Funil do vendedor: farm ou vendas. |

### `GET /analytics/sdr-ranking` — Pública

Ranking de SDRs.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |

### `GET /analytics/sdr-ranking/last-week` — Pública

Ranking de SDRs da semana passada. Sem parâmetros.

---

## Arquivos estáticos — `/public`

### `GET /public/<arquivo>` — Pública

Serve os arquivos da pasta [public/](public/) (fotos, camisetas e vídeos de escalação/gol). Ex.: `/public/brenda.png`, `/public/brenda_gol.webm`.
