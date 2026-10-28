# Rotas da API

Todas as rotas são montadas em [app.js](app.js). Respostas de sucesso (exceto `/auth` e o webhook) seguem o formato:

```json
{ "success": true, "data": ..., "message": "..." }
```

Erros passam pelo handler global e retornam `{ "error": "mensagem" }` com o status correspondente. Rota que não existe → `404`.

## Resumo

| Método | Rota | Acesso | Parâmetros | Controller → Service |
|---|---|---|---|---|
| POST | `/auth/register` | Pública | body | `registerUser` → `registerUser` |
| POST | `/auth/login` | Pública | body | `loginUser` → `loginUser` |
| POST | `/auth/refresh` | Pública (exige cookie) | cookie `refreshToken` | `refreshUserTokens` → `refreshUserTokens` |
| GET | `/sales/admin` | **Privada** (JWT) | query `page`, `limit` | `getAllSales` → `findAll` |
| GET | `/sales/get` | Pública | query `page`, `limit` | `getWeekSales` → `findActiveByWeek` |
| GET | `/sales/get/:vendorId` | **Privada** (JWT) | path `vendorId` | `getSalesByVendor` → `findByVendor` |
| GET | `/sales/events` | Pública | — | `getClient` (SSE) |
| POST | `/sales/webhook/sheet` | Protegida por segredo | header `webhook_secret`, body | `sheetSaleEntry` → `sheetSalesProcess` |
| GET | `/vendor/list` | Pública | — | `getAllVendors` → `findAll` |
| GET | `/sdr/list` | Pública | — | `getAllSdrs` → `findAll` |
| GET | `/analytics/goal` | Pública | — | `getGoalProgress` → `getGoalProgress` |
| GET | `/analytics/scoreboard` | Pública | query `period` | `getScoreboard` → `getScoreboard` |
| GET | `/analytics/scoreboard/last-week` | Pública | — | `getLastWeekScoreboard` → `getScoreboard("lastWeek")` |
| GET | `/analytics/ranking` | Pública | query `period`, `vendorDepartment` | `getVendorRanking` → `getVendorRanking` |
| GET | `/analytics/ranking/last-week` | Pública | query `vendorDepartment` | `getLastWeekVendorRanking` → `getVendorRanking("lastWeek")` |
| GET | `/analytics/sdr-ranking` | Pública | query `period` | `getSdrRanking` → `getSdrRanking` |
| GET | `/analytics/sdr-ranking/last-week` | Pública | — | `getLastWeekSdrRanking` → `getSdrRanking("lastWeek")` |
| POST | `/logs` | Pública (limite por IP) | body | `createLog` → `create` |
| GET | `/logs` | **Privada** (JWT) | — | `getLogs` → `findLatest` |
| GET | `/public/*` | Pública (arquivos estáticos) | path do arquivo | — |

**Rotas públicas** são as usadas pelas telas (TVs), que não fazem login. **Rotas privadas** são do admin.

## Autenticação

Rotas **privadas** passam pelo [authMiddleware](middlewares/authMidleware.js) e exigem o header:

```
Authorization: Bearer <token>
```

O `token` vem da resposta de `/auth/login`, `/auth/register` ou `/auth/refresh` e expira em **60 minutos**.

- Sem header → `401 Token não encontrado`
- Token inválido ou expirado → `401 Token inválido ou expirado` (o front deve chamar `/auth/refresh` e repetir a requisição)

## CORS

Só as origens listadas em [app.js](app.js) podem chamar a API pelo navegador. Origem = protocolo + endereço + **porta** (`http://localhost:5173` e `http://localhost:5174` são origens diferentes).

O CORS está com `credentials: true`, então o front pode enviar o cookie `refreshToken`. Para isso, toda requisição precisa de `withCredentials: true` (axios) ou `credentials: "include"` (fetch).

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

As vendas são **somente leitura** no sistema: só são criadas, atualizadas e canceladas pela planilha (a planilha é a fonte da verdade). Correções são feitas na planilha.

### Formato de uma venda

```json
{
  "_id": "...",
  "rdDealId": "698c8b9bcba0e30015883816",
  "rdDealName": "Nome da negociação",
  "vendorId": { "_id": "...", "vendorName": "...", "imageUrl": "...", "teamId": "...", "job": "..." },
  "sdrIds": [{ "_id": "...", "name": "...", "imageUrl": "...", "teamId": "...", "job": "..." }],
  "value": 1199,
  "segment": "b2b",
  "funnelType": "sales",
  "dealStatus": "ativa",
  "realizedAt": "2026-10-09T14:07:59.436Z",
  "rdUpdatedAt": "2026-10-14T15:00:21.027Z",
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Campo | Descrição |
|---|---|
| `vendorId` / `sdrIds` | Nas rotas de `/sales` vêm **populados** (objeto do vendedor e lista de objetos das pessoas da passagem). `sdrIds` é uma lista: vazia quando a venda não teve passagem, com uma ou mais pessoas quando teve. |
| `segment` | `b2b` ou `b2g`. |
| `funnelType` | `sales` (Vendas) ou `farm` (Renovação). |
| `dealStatus` | `ativa` ou `cancelada`. Só vendas ativas contam nas telas. |
| `realizedAt` | Coluna "Data da venda" da planilha. É a data usada nos filtros de semana. |

### `GET /sales/admin` — Privada

Lista **todas** as vendas, ativas e canceladas, da mais nova para a mais antiga.

**Query** (opcionais — a paginação só é aplicada se **os dois** forem enviados):

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `page` | número | Página desejada, começando em 1. |
| `limit` | número | Quantidade de vendas por página. |

**Resposta:** `data: { data: [vendas], total }` — `total` é a quantidade de vendas no banco (para montar a paginação).

### `GET /sales/get` — Pública

Lista as vendas **ativas** da **semana atual** (segunda 00:00 até domingo 23:59, horário de São Paulo).

**Query:** mesmos `page` e `limit` opcionais de `/sales/admin`.

**Resposta:** `data: { data: [vendas], total }`

### `GET /sales/get/:vendorId` — Privada

Lista as vendas de um vendedor, ativas e canceladas.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `vendorId` | path | `_id` do vendedor no banco (o mesmo que vem em `/vendor/list`). |

**Resposta:** `data: { data: [vendas], total }`

### `GET /sales/events` — Pública

Abre uma conexão **SSE** (`text/event-stream`) para receber eventos em tempo real. Cada evento chega como `data: <json>`. Sem parâmetros. Os cabeçalhos são enviados assim que a conexão abre, então o `onopen` do `EventSource` dispara na hora.

Existem dois tipos de evento:

**Venda nova** (abre o popup):

```json
{
  "sale": { "_id": "...", "funnelType": "sales" },
  "vendor": { "vendorName": "...", "job": "...", "imageUrl": "..." },
  "sdrs": [{ "name": "...", "job": "...", "imageUrl": "..." }],
  "sdr": { "name": "...", "job": "...", "imageUrl": "..." }
}
```

- `sdrs` e `sdr` só existem quando a venda teve passagem.
- `sdrs` é a lista de **todas** as pessoas da passagem, na ordem em que vieram da planilha.
- `sdr` é a primeira pessoa da lista. Existe só para o popup atual do front, que mostra uma pessoa; sai quando o popup passar a mostrar a lista `sdrs`.
- `funnelType` é `sales` (Venda) ou `farm` (Renovação).
- Só vão os campos que o popup usa, porque o evento chega a todas as telas conectadas. Um campo sem valor no banco (ex.: `imageUrl`) não aparece no JSON.

**Venda alterada** (só atualiza as telas, sem popup):

```json
{ "type": "sale-updated" }
```

Enviado quando uma venda é cancelada, reativada ou tem algum dado corrigido. Vai **um por envio**, mesmo que o envio altere várias vendas (a sincronização de 10 em 10 minutos reenvia a planilha toda e dispara um único aviso).

**Nenhum evento** quando nada muda no banco: linha cancelada que nunca foi concluída, linha com erro ou envio atrasado.

### `POST /sales/webhook/sheet` — Protegida por segredo

Recebe as linhas da planilha de vendas, enviadas pelo Apps Script. Não usa JWT: o header `webhook_secret` (ou `x-webhook-secret`) traz o mesmo valor do `WEBHOOK_SECRET` do servidor, guardado nas Propriedades do script. Se o segredo não estiver configurado no servidor, recusa tudo.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `webhook_secret` ou `x-webhook-secret` | header | Igual ao `WEBHOOK_SECRET` do servidor. Diferente ou ausente → `401 Acesso negado`. |
| body | JSON | **Lista** de linhas (o Apps Script manda em lotes de 50). Uma linha solta também é aceita. |

**Formato de uma linha** (as chaves são os nomes das colunas da planilha):

```json
{
  "linha": 2,
  "Id da venda": "3f2b9c1e-...",
  "Atualizado em": "2026-10-27T15:00:00.000Z",
  "Id da empresa": "teste",
  "Vendedor": "Renan Souza",
  "Passagens": "Ana Clara, Victor Batilochi",
  "Setor": "B2B",
  "Classificação": "Renovação",
  "Valor da venda": 10000,
  "Data da venda": "2026-10-03T03:00:00.000Z",
  "Status": "Concluída"
}
```

| Coluna | Vira | Regra |
|---|---|---|
| `Id da venda` | `rdDealId` | Obrigatório. UUID gerado pelo Apps Script. Identifica a venda em todos os envios |
| `Atualizado em` | `rdUpdatedAt` | Obrigatório. Momento do envio. Envio mais antigo que o já salvo é ignorado |
| `Id da empresa` | `rdDealName` | Mostrado como "Negociação" no admin |
| `Vendedor` | `vendorId` | Busca o vendor pelo `vendorName` (texto exato) |
| `Passagens` | `sdrIds` | Nomes separados por vírgula. Busca cada SDR pelo `name`; nome desconhecido é descartado |
| `Setor` | `segment` | `B2B` ou `B2G` (sem diferenciar maiúsculas) |
| `Classificação` | `funnelType` | `Renovação` = `farm`; vazio = `sales` |
| `Valor da venda` | `value` | Número ≥ 0 |
| `Data da venda` | `realizedAt` | Data usada nos filtros de semana. Pode ser corrigida |
| `Status` | `dealStatus` | `Concluída` = `ativa`; `Cancelada` (ou outro) = `cancelada` |

**Resposta:** `200` com o resultado de cada linha, que aparece no log do Apps Script:

```json
{
  "success": true,
  "data": [
    { "linha": 2, "idVenda": "3f2b9c1e-...", "status": "criada" },
    { "linha": 3, "idVenda": "a81c...", "status": "erro", "mensagem": "Vendedor \"Fulano\" não cadastrado" }
  ],
  "message": "Linhas da planilha processadas"
}
```

**O que acontece com cada linha:**

| Situação da linha | `status` na resposta | Resultado no banco |
|---|---|---|
| `Concluída` pela primeira vez | `criada` | Cria a venda como `ativa` (popup nas TVs) |
| `Concluída`, venda já existe | `atualizada` | Atualiza os dados (e reativa, se estava cancelada) |
| Não `Concluída`, venda existe | `cancelada` | Cancela. Com os dados completos, também atualiza os dados |
| Não `Concluída`, venda nunca existiu | `ignorada` | Nada |
| Envio mais antigo que o já salvo | `ignorada` | Nada |
| `Concluída` com vendedor não cadastrado, setor inválido, valor ou data inválidos | `erro` | Nada (as outras linhas do lote seguem normalmente) |
| Sem `Id da venda` ou `Atualizado em` | `erro` | Nada |

---

## Vendedores — `/vendor`

### `GET /vendor/list` — Pública

Lista todos os vendedores. Sem parâmetros.

**Resposta:** `data: [{ _id, rdUserId, vendorName, imageUrl, teamId, job, createdAt, updatedAt }]`

---

## SDRs — `/sdr`

### `GET /sdr/list` — Pública

Lista todas as pessoas que fazem passagem (SDR, Suporte e CS, diferenciadas pelo `job`). Sem parâmetros.

**Resposta:** `data: [{ _id, name, imageUrl, teamId, job, createdAt, updatedAt }]`

---

## Analytics — `/analytics`

Todas as rotas consideram **só vendas ativas**. Valores inválidos ou ausentes nos parâmetros **não geram erro**: caem no valor padrão.

**Pontos** (calculados na hora, a partir das variáveis do `.env`):

| Tipo | Variável | Vai para o time de |
|---|---|---|
| Venda (`funnelType: sales`) | `POINTS_PER_SALE` | quem vendeu |
| Renovação (`funnelType: farm`) | `POINTS_PER_FARM` | quem vendeu |
| Passagem (cada pessoa em `sdrIds`) | `POINTS_PER_PASSAGE` por pessoa | cada pessoa que participou da passagem |

**Períodos:** `week` = semana atual e `last-week` = semana passada (segunda 00:00 a domingo 23:59, horário de São Paulo); `all` = campanha inteira. O filtro usa a data da venda (`realizedAt`).

### `GET /analytics/goal` — Pública

Retorna a meta da Black Friday e o progresso, já calculado. Sem parâmetros. O total é da campanha inteira.

**Resposta:**

```json
{ "goal": 500000, "total": 125000, "percent": 25 }
```

| Campo | Descrição |
|---|---|
| `goal` | Meta da Black (variável `BLACK_FRIDAY_GOAL`). |
| `total` | Soma do valor de todas as vendas ativas. |
| `percent` | `total / goal × 100`, com 2 casas decimais. Pode passar de 100 se a meta for batida. Meta não configurada → `0`. |

### `GET /analytics/scoreboard` — Pública

Placar dos times, do maior total para o menor. Todo time aparece, mesmo com zero pontos.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |

**Resposta:**

```json
[
  { "teamId": "...", "teamName": "Sem freio", "teamShirt": "http://.../camiseta_azul.png", "sales": 6, "farm": 4, "passage": 1, "total": 11 }
]
```

| Campo | Descrição |
|---|---|
| `teamShirt` | Escudo/camiseta do time (`imageUrl` do Team). |
| `sales` | Pontos de vendas (B2B + B2G) dos vendedores do time. |
| `farm` | Pontos de renovações (B2B + B2G) dos vendedores do time. |
| `passage` | Pontos de passagens feitas por pessoas do time (SDR + Suporte + CS). |
| `total` | `sales + farm + passage`. |

### `GET /analytics/scoreboard/last-week` — Pública

Placar da semana passada. Sem parâmetros. Mesmo formato de resposta do `/analytics/scoreboard`.

### `GET /analytics/ranking` — Pública

Ranking de vendedores (artilheiros): **top 3** por pontos. Sem critério de desempate.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |
| `vendorDepartment` | query | `farm` \| `sales` | `sales` | **Tipo da venda** contado: `sales` = ranking de Vendas, `farm` = ranking de Renovação. Um vendedor que fez os dois tipos pode aparecer nos dois rankings. |

**Resposta:**

```json
{ "vendor": [{ "vendorId": "...", "name": "...", "job": "...", "teamId": "...", "points": 9, "imageUrl": "..." }] }
```

### `GET /analytics/ranking/last-week` — Pública

Ranking de vendedores da semana passada. Mesmo formato de resposta do `/analytics/ranking`.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `vendorDepartment` | query | `farm` \| `sales` | `sales` | Tipo da venda: `sales` = Vendas, `farm` = Renovação. |

### `GET /analytics/sdr-ranking` — Pública

Ranking de passagens: **top 3** por pontos de passagem. Inclui SDR, Suporte e CS.

| Parâmetro | Onde | Valores | Padrão | Descrição |
|---|---|---|---|---|
| `period` | query | `week` \| `all` | `all` | `week` = semana atual; `all` = campanha inteira. |

**Resposta** (lista direta, sem objeto em volta):

```json
[{ "sdrId": "...", "name": "...", "job": "...", "teamId": "...", "points": 2, "imageUrl": "..." }]
```

`points` = quantidade de passagens × `POINTS_PER_PASSAGE`.

### `GET /analytics/sdr-ranking/last-week` — Pública

Ranking de passagens da semana passada. Sem parâmetros. Mesmo formato de resposta do `/analytics/sdr-ranking`.

---

## Logs de erro do front — `/logs`

Contrato definido no `ERROS_E_LOGS.md` do front. Os logs são apagados sozinhos **30 dias** depois de recebidos.

### `POST /logs` — Pública

As TVs não fazem login, então a rota é pública. Para evitar spam, cada IP pode mandar **60 logs por minuto**. Passou disso → `429 Muitas requisições, tente novamente mais tarde`. As TVs do escritório saem pelo mesmo IP, então o limite vale para todas juntas. O front guarda no `localStorage` o que não conseguir enviar.

**Body** (validado por `CreateLogSchema`; campos extras são ignorados, não recusam o log):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `message` | string | sim | Mensagem do erro. Cortada em 2.000 caracteres |
| `level` | string | não | Padrão `error` |
| `stack` | string \| null | não | Cortado em 20.000 caracteres |
| `componentStack` | string \| null | não | Cortado em 20.000 caracteres |
| `location` | string | não | Tela, rota ou widget onde aconteceu |
| `url` | string | não | Página da TV/navegador |
| `userAgent` | string | não | Navegador |
| `occurredAt` | data ISO | não | Horário do erro pelo relógio da TV |

**Resposta:** `201 { success: true, message }`. Sem `message` → `400`.

O horário em que o backend recebeu o log fica em `createdAt`.

### `GET /logs` — Privada

Lista os **200 logs mais recentes**, do mais novo para o mais antigo (pelo horário de recebimento).

**Resposta:** `data: [{ _id, level, message, stack, componentStack, location, url, userAgent, occurredAt, createdAt, updatedAt }]`

---

## Arquivos estáticos — `/public`

### `GET /public/<arquivo>` — Pública

Serve os arquivos da pasta [public/](public/) (fotos, camisetas e vídeos de escalação/gol). Ex.: `/public/brenda.png`, `/public/brenda_gol.webm`.

---

## Rotas removidas

Não existem mais (retornam `404`). Se o front ainda chama alguma delas, precisa ser ajustado.

| Rota | Motivo |
|---|---|
| `POST /sales/webhook/deal` | O comercial deixou de usar a RD. Vendas entram pela planilha (`/sales/webhook/sheet`). |
| `POST /sales/create` | Vendas só entram pela planilha. |
| `PATCH /sales/update/:salesId` | Admin é somente leitura; correções são feitas na planilha. |
| `GET /analytics/teams/:teamId` | Escalação do time removida. |
| `GET /auth/callback` | Era rota de teste. |
