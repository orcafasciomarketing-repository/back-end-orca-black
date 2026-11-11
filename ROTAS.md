# Rotas da API

Todas as rotas são montadas em [app.js](app.js). Respostas de sucesso (exceto `/auth` e o webhook) seguem o formato:

```json
{ "success": true, "data": ..., "message": "..." }
```

Erros passam pelo handler global e retornam `{ "error": "mensagem" }` com o status correspondente. Rota que não existe → `404`.

## Resumo

| Método | Rota | Acesso | Parâmetros | Controller → Service |
|---|---|---|---|---|
| POST | `/auth/login` | Pública | body | `loginUser` → `loginUser` |
| POST | `/auth/refresh` | Pública (exige cookie) | cookie `refreshToken` | `refreshUserTokens` → `refreshUserTokens` |
| POST | `/auth/logout` | Pública (usa o cookie, se houver) | cookie `refreshToken` | `logoutUser` → `logoutUser` |
| POST | `/auth/change-password` | **Privada** (JWT; qualquer perfil, só a própria senha) | body | `changePassword` → `changePassword` |
| POST | `/auth/impersonate/:id` | **Só master** | path `id` (usuário vendedor ou passagem) | `impersonate` → `impersonate` |
| GET | `/sales/admin` | **Privada** (JWT; b2b/b2g só o setor; vendor/sdr → 403) | query `page`, `limit` | `getAllSales` → `findAll` |
| GET | `/sales/get` | Pública | query `page`, `limit` | `getWeekSales` → `findActiveByWeek` |
| GET | `/sales/get/:vendorId` | **Privada** (JWT; b2b/b2g só o setor; vendor/sdr → 403) | path `vendorId` | `getSalesByVendor` → `findByVendor` |
| GET | `/sales/events` | Pública | — | `getClient` (SSE) |
| POST | `/sales/webhook/sheet` | Protegida por segredo | header `webhook_secret`, body | `sheetSaleEntry` → `sheetSalesProcess` |
| POST | `/sales/import/preview` | **Só master** | body CSV (`text/csv`) | `previewImport` → `previewImport` |
| POST | `/sales/import` | **Só master** | body CSV (`text/csv`) | `importSales` → `importSales` |
| GET | `/vendor/list` | Pública | — | `getAllVendors` → `findAll` |
| GET | `/sdr/list` | Pública | — | `getAllSdrs` → `findAll` |
| GET | `/analytics/goal` | Pública | — | `getGoalProgress` → `getGoalProgress` |
| GET | `/analytics/scoreboard` | Pública | query `period` | `getScoreboard` → `getScoreboard` |
| GET | `/analytics/scoreboard/last-week` | Pública | — | `getLastWeekScoreboard` → `getScoreboard("lastWeek")` |
| GET | `/analytics/ranking` | Pública | query `period`, `vendorDepartment`, `segment` | `getVendorRanking` → `getVendorRanking` |
| GET | `/analytics/ranking/last-week` | Pública | query `vendorDepartment`, `segment` | `getLastWeekVendorRanking` → `getVendorRanking("lastWeek")` |
| GET | `/analytics/sdr-ranking` | Pública | query `period`, `segment` | `getSdrRanking` → `getSdrRanking` |
| GET | `/analytics/sdr-ranking/last-week` | Pública | query `segment` | `getLastWeekSdrRanking` → `getSdrRanking("lastWeek")` |
| GET | `/analytics/forecast` | **Privada** (JWT; b2b/b2g só o setor; vendor/sdr → 403) | query `segment` | `getForecast` → `getForecast` |
| GET | `/analytics/points-history` | **Privada** (JWT; b2b/b2g só o setor; vendor/sdr → 403) | query `segment` | `getPointsHistory` → `getPointsHistory` |
| GET | `/analytics/people-points` | **Privada** (JWT; b2b/b2g só o setor; vendor/sdr → 403) | query `period`, `segment`, `from`, `to` | `getPeoplePoints` → `getPeoplePoints` |
| POST | `/logs` | Pública (limite por IP) | body | `createLog` → `create` |
| GET | `/logs` | **Só master** | — | `getLogs` → `findLatest` |
| GET | `/users` | **Master e admin** | — | `getUsers` → `findAll` |
| POST | `/users` | **Master e admin** | body | `createUser` → `createUser` |
| PATCH | `/users/:id` | **Só master** | path `id`, body | `updateUser` → `updateUser` |
| DELETE | `/users/:id` | **Só master** | path `id` | `deleteUser` → `deleteUser` |
| GET | `/me` | **Só vendor e sdr** | — | `getProfile` → `getProfile` |
| GET | `/me/sales` | **Só vendor e sdr** | — | `getSales` → `getSales` |
| GET | `/me/team` | **Só vendor e sdr** | query `period` | `getTeam` → `getTeam` |
| GET | `/me/prizes` | **Só vendor e sdr** | — | `getPrizes` → `getPrizes` |
| GET | `/me/goals` | **Só vendor e sdr** | query `month` | `getGoals` → `getGoals` |
| GET | `/campaigns` | **Privada** (master, admin, b2b, b2g) | — | `list` → `list` |
| POST | `/campaigns` | **Master e admin** | body | `create` → `create` |
| PUT | `/campaigns/:id` | **Master e admin** | path `id`, body | `update` → `update` |
| DELETE | `/campaigns/:id` | **Master e admin** | path `id` | `remove` → `remove` |
| GET | `/goals/:month` | **Master e admin** | path `month` (AAAA-MM) | `getMonth` → `getMonth` |
| GET | `/goals/:month/progress` | **Master e admin** | path `month` | `getProgress` → `getProgress` |
| GET | `/goals/:month/history` | **Master e admin** | path `month`, query `months` | `getHistory` → `getHistory` |
| PUT | `/goals/:month/:segment` | **Master e admin** | path `month`, `segment`, body | `saveMonth` → `saveMonth` |
| DELETE | `/goals/:month/:segment` | **Master e admin** | path `month`, `segment` | `deleteMonth` → `deleteMonth` |
| GET | `/public/*` | Pública (arquivos estáticos) | path do arquivo | — |

**Rotas públicas** são as usadas pelas telas (TVs), que não fazem login. **Rotas privadas** são do admin.

**Campanha (`?campaign=<id>`):** as rotas de `/analytics` (menos o forecast com `?month=`), `/prizes`, `/prizes/withdrawals` (inclusive o `POST`), `/sales/admin` e `/sales/get/:vendorId` aceitam `?campaign=<id>` e fazem as contas só com as vendas do período dessa campanha (e, nos prêmios, só com as retiradas dela). **Sem o parâmetro, vale a campanha ativa** (as TVs e a área dos colaboradores nunca mandam). Id inválido → `400`; campanha que não existe → `404`. Ver "Campanhas — `/campaigns`".

## Autenticação

Rotas **privadas** passam pelo [authMiddleware](middlewares/authMidleware.js) e exigem o header:

```
Authorization: Bearer <token>
```

O `token` vem da resposta de `/auth/login` ou `/auth/refresh` e expira em **60 minutos**.

- Sem header → `401 Token não encontrado`
- Token inválido ou expirado → `401 Token inválido ou expirado` (o front deve chamar `/auth/refresh` e repetir a requisição)
- Usuário do token não existe mais (excluído) → `401 Usuário não encontrado`

### Perfis

O middleware busca o usuário no banco a cada requisição: o perfil vem do banco, não do token, então trocar o perfil ou excluir o usuário vale na hora.

| Perfil | Vendas (`/sales/admin`, `/sales/get/:vendorId`) | Importação e logs | Ver e cadastrar usuários | Trocar perfil/senha e excluir usuários |
|---|---|---|---|---|
| `master` | todas | liberado | liberado | liberado |
| `admin` | todas | `403` | liberado | `403` |
| `b2b` | só `segment: "b2b"` (o filtro é no servidor) | `403` | `403` | `403` |
| `b2g` | só `segment: "b2g"` | `403` | `403` | `403` |
| `vendor` | `403` (só as próprias, em `/me/sales`) | `403` | `403` | `403` |
| `sdr` | `403` (só as da própria passagem, em `/me/sales`) | `403` | `403` | `403` |

- **`vendor` e `sdr` (colaboradores):** a conta fica ligada a um vendedor (`vendorId`) ou a uma pessoa de passagem (`sdrId`). Não entram em nenhuma rota do admin (`/sales/admin`, `/sales/get/:vendorId`, `/analytics/forecast`, `/analytics/points-history`, `/analytics/people-points`, `/users`, `/logs`, importação → `403`); só na área `/me`, onde a pessoa vem sempre do token (nunca da URL). Os outros perfis recebem `403` em `/me`. As rotas públicas das TVs continuam abertas para todos, como antes.

- `master` não é gravado no banco: é o usuário com o e-mail da variável `MASTER_EMAIL` (sem diferença de maiúscula). O perfil gravado dele continua `admin`. Login, refresh e `GET /users` devolvem `role: "master"` para ele.
- **Sem `MASTER_EMAIL` configurado, todo admin vale como master** (como era antes dos perfis), então um deploy antes de criar a variável não tranca ninguém para fora.
- Usuário sem o campo `role` (criado antes dos perfis) é tratado como `admin`. As rotas públicas (TVs) não mudam com o perfil.
- `403` responde `{ "error": "Sem permissão para acessar" }`.

## Segurança e carga

- **Cabeçalhos:** toda resposta leva `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer`; o `X-Powered-By` foi desligado.
- **Erros:** erro esperado (400, 401, 403, 404, 409, 429) devolve a mensagem dele. Erro inesperado (500) devolve só `{ "error": "Erro interno do servidor" }` e o detalhe vai para o log do servidor.
- **Cache curto das vendas ativas** ([shared/activeSalesCache.js](shared/activeSalesCache.js)): quando chega uma venda, todas as telas abertas recarregam juntas; as buscas iguais de vendas ativas dentro de 5 segundos viram uma só. Qualquer gravação em vendas (nova, cancelada, importada, apagada) limpa o cache na hora, então nenhuma tela vê dado velho.
- **Cache curto dos resultados das contas** ([shared/resultCache.js](shared/resultCache.js)): placar, rankings, pontos por pessoa, histórico de pontos, forecast, meta e o resumo dos prêmios (que alimenta `/prizes` e `/me/prizes`, e os pontos de `/me/team`) são calculados uma vez e reaproveitados por 5 segundos para todo mundo que pedir a mesma coisa (mesmos parâmetros). Enquanto uma conta roda, quem chega espera por ela em vez de começar outra, e o prazo só conta depois que ela termina. O progresso e o histórico das metas do mês (que alimentam `/goals` e `/me/goals`) e a lista e a campanha ativa também. Qualquer gravação em vendas, vendedores, passagens, times, retiradas de prêmio, metas ou campanhas limpa o cache na hora (ganchos nos models com `invalidateOnWrite`), então ninguém vê dado velho depois de uma mudança.
- **Leitura leve (`.lean()`)** nas buscas de vendas: as vendas ativas para as contas e as listas de vendas (`/sales/admin`, `/sales/get`, `/sales/get/:vendorId`, `/me/sales`) vêm como objetos simples, sem montar documentos do Mongoose. O JSON das respostas não muda.
- **Índices em vendas:** `{ dealStatus, realizedAt }` e `{ vendorId }`.
- **Teste de carga** (11/11/2026, local, backend limitado a 0,1 CPU e 512 MB como o Render gratuito, 3.000 vendas, 60 vendedores; todos os vendedores com a Minha área aberta + 5 TVs atualizando juntos quando entra uma venda; tempo até a tela de todos atualizar): antes das melhorias, 1 vendedor 17 s, 5 vendedores 28 s e 10 vendedores 54 s; depois, 1 vendedor 3 s, 5 vendedores 7 s, 10 vendedores 11 s, 20 vendedores 15 s, 40 vendedores 25 s e 60 vendedores 34 s, quase sem erros. O banco do teste era local; com o MongoDB na nuvem soma o tempo de rede.

## CORS

Só as origens listadas em [app.js](app.js) podem chamar a API pelo navegador. Origem = protocolo + endereço + **porta** (`http://localhost:5173` e `http://localhost:5174` são origens diferentes).

O CORS está com `credentials: true`, então o front pode enviar o cookie `refreshToken`. Para isso, toda requisição precisa de `withCredentials: true` (axios) ou `credentials: "include"` (fetch).

---

## Auth — `/auth`

Não existe mais cadastro aberto (`/auth/register` foi removida → 404): quem cadastra usuário é o admin, em `POST /users`.

### `POST /auth/login` — Pública

Autentica o usuário. Grava o cookie `refreshToken` (httpOnly). O `user` da resposta traz o `role` (`admin`, `b2b` ou `b2g`).

- **Várias sessões por conta:** cada login abre uma sessão nova e **não derruba as outras** (outro aparelho, outra aba, outra pessoa usando a mesma conta). As sessões só caem ao sair (`/auth/logout`, só aquela), ao trocar a senha, ao mudar o perfil ou a senha pelo admin e ao excluir o usuário.
- **Velocidade (custo da senha):** a senha é conferida pelo bcrypt, lento de propósito. O custo padrão agora é **10** (`ROUND_ENCRYPTION` troca; antes o padrão era 15, ~50 s por login no Render gratuito, contra ~1,5 s com 10). Senha gravada com custo maior que o atual é **regravada com o custo atual no primeiro login certo** (mesma senha, sem derrubar sessões): só esse primeiro login ainda demora. Se não conseguir regravar, o login continua e tenta de novo no próximo. Para as contas de colaboradores que ainda usam a senha inicial do seed, o script `node scripts/rehashSenhas.js --banco=<banco> [--gravar]` (rodado à mão, com o `MONGO_URI` e a `PEPPER` do `.env`) regrava a mesma senha com o custo atual sem precisar de login; sem `--gravar` só simula. Rodado em 11/11/2026 no banco de produção (`bo-dash`): 12 contas regravadas; as 16 que já tinham trocado a senha ficam para o primeiro login.
- **Limite de tentativas erradas:** 10 respostas `401` a cada 15 minutos por IP + e-mail; a 11ª tentativa recebe `429` ("Muitas tentativas de login…"), mesmo com a senha certa, até a janela passar. Um login certo zera a contagem. Como conta por e-mail, várias pessoas do mesmo escritório (mesmo IP) não se bloqueiam.

**Body** (validado por `LoginSchema`, não aceita campos extras):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | sim | E-mail válido (convertido para minúsculas). |
| `password` | string | sim | Senha com no mínimo 6 caracteres. |

**Resposta:** `200 { user, token }`

### `POST /auth/refresh` — Pública (exige cookie)

Gera um novo access token a partir do refresh token e renova o cookie (o token antigo é trocado por um novo).

- **Tolerância entre abas:** duas abas do mesmo navegador podem renovar ao mesmo tempo com o mesmo cookie. O token que acabou de ser trocado ainda vale por **30 segundos**, para a segunda aba não ser deslogada. Não vale se a sessão foi encerrada nesse meio-tempo (sair, trocar a senha, perfil ou exclusão).
- Os refresh tokens vencidos são apagados sozinhos pelo MongoDB (índice TTL em `expiresAt`), e o campo `token` tem índice único.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `refreshToken` | cookie | Enviado automaticamente pelo navegador (o front precisa usar `credentials: "include"`). |

**Resposta:** `200 { user, token }`

### `POST /auth/logout` — Pública (usa o cookie)

Encerra a sessão deste navegador: invalida o refresh token do cookie e apaga o cookie. Funciona mesmo com o access token vencido (não exige o header `Authorization`). As outras sessões da pessoa (outros navegadores) continuam. Sem cookie, ou com um token que já não vale, também responde `200`.

**Resposta:** `200 { success: true, message: "Sessão encerrada" }`

### `POST /auth/change-password` — Privada

Qualquer perfil logado troca **a própria** senha: o usuário vem do token, não existe parâmetro para escolher outra pessoa.

**Body** (`ChangePasswordSchema`, não aceita campos extras):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `currentPassword` | string | sim | Senha atual. Errada → `400 Senha atual incorreta`. |
| `password` | string | sim | Nova senha, no mínimo 6 caracteres. |
| `passwordConfirmation` | string | sim | Igual a `password`, senão "Senhas são diferentes". |

Derruba todas as sessões abertas da pessoa (refresh tokens revogados) e abre uma sessão nova para quem trocou: grava o cookie `refreshToken` novo e devolve um access token novo, então a pessoa continua logada neste navegador.

**Resposta:** `200 { user, token, message: "Senha alterada" }`

---

### `POST /auth/impersonate/:id` — Só master

"Acessar como": o master vê o sistema como um vendedor ou uma pessoa de passagem veem (Minha área e Minhas metas). Responde `{ user, token }`: o usuário da pessoa (sem a senha) e um **access token da conta dela, marcado com o id do master** (`impersonatedBy`), que vale 60 minutos. **Não cria sessão nem mexe no cookie** do master: para voltar, o front usa a sessão do master de novo (`/auth/refresh`).

- Só o master (admin, b2b, b2g e colaboradores → `403`; sem login → `401`). Só contas `vendor` e `sdr` (outro perfil → `400` "Só dá para acessar como vendedor ou passagem"); usuário que não existe ou id inválido → `404`.
- **Só para ver:** com esse token, o `authMiddleware` recusa qualquer requisição que não seja `GET` com `403` ("No modo \"acessar como\" dá só para ver"), inclusive trocar a senha da pessoa e abrir outro "acessar como".
- A cada requisição o `authMiddleware` confere que quem abriu ainda existe e ainda é o master; se não, `401` ("Acesso como outra pessoa encerrado").
- O backend registra no log do servidor quem entrou como quem (`[acessar como] master@... entrou como fulano@...`).

---

## Vendas — `/sales`

As vendas da planilha são **somente leitura** no sistema: só são criadas, atualizadas e canceladas pela planilha (a planilha é a fonte da verdade). Correções são feitas na planilha. A única exceção é a importação por CSV do admin (`/sales/import`), que só mexe nas vendas importadas.

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
  "source": "planilha",
  "createdAt": "...",
  "updatedAt": "..."
}
```

| Campo | Descrição |
|---|---|
| `vendorId` / `sdrIds` | Nas rotas de `/sales` vêm **populados** (objeto do vendedor e lista de objetos das pessoas da passagem). `sdrIds` é uma lista: vazia quando a venda não teve passagem, com uma ou mais pessoas quando teve. `vendorId` pode ser `null` em venda importada sem vendedor (conta na meta, não pontua). |
| `source` | `planilha` ou `importacao` (veio do CSV do admin). Vendas antigas, sem o campo, vêm como `planilha`. Vendas importadas também têm `importId` (lote) e `rdDealId` no formato `importacao:<uuid>`. |
| `segment` | `b2b` ou `b2g`. |
| `funnelType` | `sales` (Vendas) ou `farm` (Renovação). |
| `dealStatus` | `ativa` ou `cancelada`. Só vendas ativas contam nas telas. |
| `realizedAt` | Coluna "Data da venda" da planilha. É a data usada nos filtros de semana. |

### `GET /sales/admin` — Privada

Lista **todas** as vendas, ativas e canceladas, da mais nova para a mais antiga. Para `b2b`/`b2g`, só as vendas do setor (o `total` também).

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

Lista as vendas de um vendedor, ativas e canceladas. Para `b2b`/`b2g`, só as do setor.

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

### `POST /sales/import/preview` — Só master

Lê o CSV e devolve a prévia da importação. **Nunca grava.** Arquivo com erro também volta `200`, com os erros na lista.

| Parâmetro | Onde | Descrição |
|---|---|---|
| `Content-Type: text/csv` | header | Obrigatório (sem ele o corpo não é lido → `400 Arquivo vazio`). |
| body | texto | Conteúdo do CSV, até 2 MB. Separado por `,` (Sheets) ou `;` (Excel). |

**Colunas** (lidas pelo nome do cabeçalho, em qualquer ordem): `Setor`, `Valor da venda` e `Data da venda` obrigatórias; `Id da empresa`, `Vendedor`, `Passagens`, `Classificação` e `Status` opcionais. Mesmas regras da planilha, com estas diferenças:

| Coluna | Na importação |
|---|---|
| `Vendedor` | Opcional. Vazio = venda sem vendedor (só conta na meta). Nome não cadastrado → erro |
| `Passagens` | Sem vendedor e com passagem → erro. Nome não cadastrado → aviso (descartado) |
| `Valor da venda` | Aceita `1000`, `1.234,56`, `R$ 1.234,56` |
| `Data da venda` | Aceita `27/11/2026`, `27/11/2026 14:30` (horário de São Paulo) ou ISO |
| `Status` | Com a coluna, só `Concluída` entra. Sem a coluna, todas as linhas entram |
| `Id da venda` | Não é gravado (a importada ganha um id próprio). Só serve para avisar duplicada |

**Resposta:**

```json
{
  "success": true,
  "data": {
    "current": { "count": 40, "total": 300000 },
    "file": { "count": 42, "total": 310000, "withVendor": 5, "withoutVendor": 37 },
    "errors": [{ "linha": 7, "mensagem": "Data da venda inválida" }],
    "warnings": [{ "linha": 9, "mensagem": "Passagem não cadastrada (descartada): \"Ana\"" }],
    "duplicates": [{ "linha": 12, "mensagem": "Parece já existir na planilha (Empresa X)" }],
    "ignored": [{ "linha": 15, "mensagem": "Status diferente de Concluída" }]
  },
  "message": "Prévia da importação"
}
```

| Campo | Descrição |
|---|---|
| `current` | Vendas importadas hoje no banco (quantidade e soma), que serão substituídas. |
| `file` | O que o arquivo vai gravar. |
| `errors` | Impedem a importação. `linha` é a linha do arquivo (cabeçalho = 1). `linha: 1` = coluna obrigatória faltando. |
| `warnings` | Não impedem. |
| `duplicates` | Não impedem. Venda que parece já estar na planilha (mesmo `Id da venda`, ou mesma empresa, valor e dia) e contaria duas vezes. |
| `ignored` | Linhas que não entram (Status diferente de Concluída). |

### `POST /sales/import` — Só master

Mesmos parâmetros e validação da prévia. **Substitui todas as vendas importadas antes** pelas do arquivo (o arquivo é a lista completa). Nunca mexe nas vendas da planilha.

- Sucesso → `200` com o mesmo formato da prévia (`current` já é o resultado novo) e um `{ "type": "sale-updated" }` no SSE (sem popup).
- Arquivo com erro → `400` com `{ "success": false, "data": <prévia>, "error": "O arquivo tem erros, nada foi importado" }`. Nada é gravado e a importação anterior continua valendo.
- Arquivo sem nenhuma venda (só cabeçalho, ou todas ignoradas) → `400 Nenhuma venda para importar no arquivo`. Nada é apagado.
- Arquivo vazio → `400 Arquivo vazio`. Importação em andamento → `409`.

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

| Tipo | Variável (valor definido) | Vai para o time de |
|---|---|---|
| Venda B2G (`segment: b2g`, `funnelType: sales`) | `POINTS_B2G_SALE` (3) | quem vendeu |
| Farmer/Renovação B2G (`segment: b2g`, `funnelType: farm`) | `POINTS_B2G_FARM` (2) | quem vendeu |
| Venda B2B (`segment: b2b`, `funnelType: sales`) | `POINTS_B2B_SALE` (2) | quem vendeu |
| Farmer/Renovação B2B (`segment: b2b`, `funnelType: farm`) | `POINTS_B2B_FARM` (1) | quem vendeu |
| Passagem de pessoa com cargo `B2G SDR` | `POINTS_B2G_SDR` (2) | a pessoa da passagem |
| Passagem de pessoa com cargo `B2B SDR` (só o Victor Batilochi) | `POINTS_B2B_SDR` (1) | a pessoa da passagem |
| Passagem de pessoa com cargo `CS` | `POINTS_CS` (1) | a pessoa da passagem |
| Passagem de pessoa com cargo `Suporte` | `POINTS_SUPORTE` (2) | a pessoa da passagem |

O valor da venda vem do **Setor da venda** (coluna da planilha). O da passagem vem do **cargo (`job`) da pessoa**, não do Setor da venda. Cargo fora da tabela vale 0.

**Setor nos rankings:** `/ranking`, `/sdr-ranking` e as versões `last-week` aceitam `?segment=b2b` ou `?segment=b2g` (sem diferença de maiúscula): só as vendas daquele setor entram na conta, com a mesma tabela de pontos. Sem o parâmetro, vazio ou com outro valor, a resposta é a mesma de antes (todos os setores); as TVs não mandam o parâmetro e não mudam.

**Períodos:** `week` = semana atual e `last-week` = semana passada (segunda 00:00 a domingo 23:59, horário de São Paulo); `all` = campanha inteira. O filtro usa a data da venda (`realizedAt`).

### `GET /analytics/goal` — Pública

Retorna a meta da Black Friday e o progresso, já calculado. Sem parâmetros. O total é da campanha inteira.

**Resposta:**

```json
{
  "goal": 3000000, "total": 750000, "percent": 25,
  "segments": {
    "b2b": { "goal": 2000000, "total": 500000, "percent": 25 },
    "b2g": { "goal": 1000000, "total": 250000, "percent": 25 }
  }
}
```

| Campo | Descrição |
|---|---|
| `goal` | Meta total da campanha (a cadastrada em `/campaigns`; na primeira campanha, a do `.env`). |
| `total` | Soma do valor de todas as vendas ativas. |
| `percent` | `total / goal × 100`, com 2 casas decimais. Pode passar de 100 se a meta for batida. Meta não configurada → `0`. |
| `segments` | Meta, total e percentual de cada setor (filtros B2B/B2G do admin). Meta do setor não configurada → `goal: 0` e `percent: 0` (o front usa a meta total). A TV só usa `goal`, `total` e `percent`. |

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

`points` = soma, por venda em que a pessoa participou da passagem, dos pontos do cargo dela.

### `GET /analytics/sdr-ranking/last-week` — Pública

Ranking de passagens da semana passada. Sem parâmetros. Mesmo formato de resposta do `/analytics/sdr-ranking`.

### `GET /analytics/forecast` — Privada

Forecast da campanha e da semana atual (modelo do `forecast_automatico_crm.pdf`). Qualquer perfil logado; **não é das TVs**. O cálculo fica em [forecastCalculator.js](features/analytics/service/forecastCalculator.js) as datas e os feriados, em [config/campaign.js](config/campaign.js), e os pesos e os fatores de cada setor, em [config/forecastModels.js](config/forecastModels.js).

| Parâmetro | Onde | Valores | Descrição |
|---|---|---|---|
| `segment` | query | `b2b` \| `b2g` | Só as vendas e a meta do setor (sem diferença de maiúscula). Outro valor ou vazio = todos. **b2b/b2g sempre recebem o próprio setor**, o parâmetro é ignorado. |
| `month` | query | `AAAA-MM` | Forecast do **mês** em vez da campanha (outro formato → `400`). Veja "Forecast do mês" abaixo. |

**Regras:**
- Campanha de **03/11 a 01/12/2026**. **Dias produtivos:** segunda a sábado, sem feriados (20/11 cai na campanha). Venda em domingo ou feriado conta no dia produtivo anterior.
- **Hoje** conta como dia já passado (as vendas de hoje já estão no vendido). Dias restantes = dias produtivos depois de hoje até 01/12.
- **Vendido** = todas as vendas ativas (igual ao total da meta, inclusive as de antes de 03/11). As médias usam só os dias produtivos da campanha, **contando os dias sem venda como R$ 0**.
- **Um modelo por setor** ([config/forecastModels.js](config/forecastModels.js)): o B2B usa as fórmulas do PDF; o **B2G, por enquanto, usa o modelo do B2B** (`basedOn: "b2b"`) até chegarem as fórmulas dele. Venda sem setor usa o B2B. A resposta traz `model: { key, label, basedOn }`.
- **Todos (sem setor)** = soma dos forecasts do B2B e do B2G, cada um com o seu modelo: ritmo, cenários (da campanha e da semana) e trajetória somados; ritmo necessário, cobertura, gap e probabilidade recalculados com a soma (o desvio é das vendas somadas). `model.key = "total"` e `model.parts` lista os modelos usados. Com modelos iguais dá o mesmo que calcular tudo junto. Se os pesos dos setores forem diferentes, `pace.weights` vem `null`.
- **Ritmo** (modelo do B2B) = média dos últimos 7 dias produtivos × 50% + dos últimos 30 × 30% + da campanha × 20%.
- **Cenários** = vendido + ritmo × fator × dias restantes (pessimista 0,8; realista 1; otimista 1,2).
- **Ritmo necessário** = (meta − vendido) ÷ dias restantes. **Cobertura** = ritmo ÷ necessário (não é a chance de bater a meta). **Gap** = meta − realista (negativo = acima da meta).
- **Probabilidade** = 1 − Normal(z), com z = (meta − realista) ÷ (desvio padrão diário × √dias restantes). O desvio é dos últimos 30 dias produtivos. Com menos de 2 dias → `null`. Meta batida → 100; campanha encerrada sem bater → 0.
- **Meta**: a do setor na campanha; sem ela (0), a total (`goalIsTotal: true`). O período (`campaign.start`/`end`) é o da campanha, e `period` traz `{ type: "campaign", campaignId, name }`.
- **Semana**: segunda a sábado da semana atual (no máximo até 01/12), com os cenários em `week` (o formato de `week` não mudou).
- **Meta semanal** (`weekGoal`, campo à parte para `week` continuar igual): automática. Pega o que faltava da meta **antes da segunda-feira** (vendas da própria semana não mexem nela) ÷ dias produtivos da segunda até 01/12 × dias produtivos da semana. Ex.: meta 200 mil, vendido 10 mil até domingo, 19 dias produtivos até o fim e 6 na semana → 190.000 ÷ 19 × 6 = 60 mil. Traz `goal`, `sold` (vendido na semana), `percent`, `remaining`, `productiveDays` (da semana) e `requiredPace` (o que falta ÷ dias produtivos depois de hoje na semana; `null` sem dias). `null` antes da campanha, depois dela ou sem meta. Com a meta já batida, `goal` é 0 e `percent` é `null`.

**Forecast do mês (`?month=AAAA-MM`):** o mesmo cálculo e os mesmos modelos, mas o período são as semanas que começam no mês (como nas metas mensais; ex.: novembro/2026 = 02/11 a 06/12), o vendido conta só as vendas desse período e a meta é a **Meta do cadastro de metas** (do setor, ou a soma dos setores com "Todos"); sem meta cadastrada, `goal` é `0`. A resposta traz `period: { type: "month", month, start, end }` e `monthTiers` (`{ goal, super, black }` do mês, ou `null`); `campaign.start`/`campaign.end` passam a ser o início e o fim do mês. Sem `month`: `period: { type: "campaign" }`. Como a importação só traz as vendas da campanha, os outros meses aparecem sem vendas.

**Resposta** (valores em reais; `paceCoverage` e `probability` em %, com 2 casas):

```json
{
  "segment": null, "goalIsTotal": true, "goal": 3000000, "today": "2026-11-06",
  "campaign": {
    "start": "2026-11-03", "end": "2026-12-01", "sold": 150000,
    "productiveDays": { "elapsed": 4, "remaining": 20 },
    "pace": { "current": 35000, "last7": 35000, "last30": 35000, "campaign": 35000,
              "weights": { "last7": 0.5, "last30": 0.3, "campaign": 0.2 } },
    "scenarios": { "pessimistic": 710000, "realistic": 850000, "optimistic": 990000 },
    "requiredPace": 142500, "paceCoverage": 24.56, "gap": 2150000,
    "dailyStdDev": 19578.9, "probability": 0
  },
  "week": { "start": "2026-11-02", "end": "2026-11-07", "sold": 140000, "remainingDays": 1,
            "scenarios": { "pessimistic": 168000, "realistic": 175000, "optimistic": 182000 } },
  "trajectory": { "days": ["2026-11-03", "..."], "actual": [40000, "...", null],
                  "pessimistic": [null, "...", 150000, "..."], "realistic": ["..."], "optimistic": ["..."] }
}
```

`trajectory`: um item por dia produtivo da campanha. `actual` é o vendido acumulado até hoje (depois, `null`); os cenários começam em hoje (= vendido) e vão até 01/12.

---

### `GET /analytics/points-history` — Privada

Pontos de cada time **dia a dia**, para os gráficos de evolução do admin. Qualquer perfil logado; **b2b/b2g sempre recebem o próprio setor** (como no forecast).

| Parâmetro | Onde | Valores | Descrição |
|---|---|---|---|
| `segment` | query | `b2b` \| `b2g` | Só as vendas do setor. Outro valor ou vazio = todos. |

- Só vendas ativas, com a mesma tabela de pontos do placar: venda e renovação vão para o time do vendedor, passagem para o time de cada pessoa (pelo cargo).
- `days` vai do dia da primeira venda até hoje (horário de São Paulo), **inclusive os dias sem venda** (com 0). Sem vendas, `days` é vazio.
- Os valores são do dia (não acumulados); o front acumula se quiser.

**Resposta:**

```json
{
  "segment": null,
  "days": ["2026-11-03", "2026-11-04"],
  "teams": [
    { "teamId": "...", "teamName": "Orçawinx", "teamShirt": "...",
      "sales": [6, 0], "farm": [0, 2], "passage": [1, 0], "total": [7, 2] }
  ],
  "total": [12, 5]
}
```

---

### `GET /analytics/people-points` — Privada

Pontos de **cada pessoa** (vendedores e pessoas de passagem), com o time de cada uma, para o widget "Pontos por pessoa" do admin. Qualquer perfil logado; **b2b/b2g sempre recebem o próprio setor** (como no forecast).

| Parâmetro | Onde | Valores | Descrição |
|---|---|---|---|
| `period` | query | `all` \| `week` \| `lastWeek` | Campanha inteira (padrão), semana atual ou semana passada (mesmas semanas do placar). Outro valor = `all`. |
| `segment` | query | `b2b` \| `b2g` | Só as vendas do setor. Outro valor ou vazio = todos. |
| `from`, `to` | query | `AAAA-MM-DD` | Recorta pelos dias da venda (horário de São Paulo), os dois inclusive. Formato inválido = ignorado. |

- Mesma tabela de pontos do placar e dos rankings: venda e renovação contam para o vendedor, passagem conta para cada pessoa da passagem (pelo cargo). Só vendas ativas.
- **Todo mundo aparece**, inclusive quem ainda não pontuou (com 0). Somando as pessoas de um time, dá o total do time no placar.
- `people` vem do maior para o menor `total` (empate: ordem alfabética). `kind` é `vendor` ou `sdr`.
- `teams` (em ordem alfabética) serve para montar o seletor de time.

**Resposta:**

```json
{
  "segment": null,
  "period": "all",
  "from": null,
  "to": null,
  "teams": [{ "teamId": "...", "teamName": "Orçawinx", "teamShirt": "..." }],
  "people": [
    { "personId": "...", "kind": "vendor", "name": "Gustavo Rocha", "job": "B2G Sales", "imageUrl": "...",
      "teamId": "...", "sales": 6, "farm": 0, "passage": 0, "total": 6 }
  ]
}
```

---

## Campanhas — `/campaigns`

Cada campanha tem nome, início e fim (`AAAA-MM-DD`, horário de São Paulo), meta B2B e meta B2G (a meta total `goal` é a soma), `active` e `hasBlackTier`. Código em [features/campaigns](features/campaigns). Regras em RN-74 a RN-77.

- **Vendas da campanha:** as vendas ativas com a data da venda (`realizedAt`) entre o início (00:00) e o fim (23:59:59.999) da campanha. A semana (`week`/`lastWeek`) fica limitada ao período da campanha.
- **Ativa:** sempre uma só. É a das TVs, da área dos colaboradores e de quem não manda `?campaign=`. Marcar outra como ativa desmarca a anterior.
- **Primeira campanha:** sem nenhuma campanha no banco (primeira subida depois da atualização), o backend cria a **"Campanha Black"** com as datas de [config/campaign.js](config/campaign.js) e as metas do `.env` (`BLACK_FRIDAY_GOAL_B2B/B2G`; a total é a `BLACK_FRIDAY_GOAL`), ativa e com Meta black. O período é estendido para cobrir a primeira e a última venda ativa que já estão no banco (os totais das TVs continuam iguais). Ela fica com `isDefault: true`, e as retiradas de prêmio sem campanha (gravadas antes) são dela.
- Gravar, ativar ou excluir uma campanha manda o evento SSE `{ "type": "sale-updated" }`: as TVs e as telas abertas buscam os dados de novo.
- Lista e campanha ativa ficam no cache de 5 segundos dos resultados (limpo a cada gravação em campanhas).

### `GET /campaigns`

Master, admin, b2b e b2g (para escolher a campanha nas telas). Vendor/sdr → `403`; sem login → `401`. A mais recente (pelo início) primeiro.

```json
[
  {
    "id": "6650...", "name": "Campanha Black", "start": "2026-11-03", "end": "2026-12-01",
    "goals": { "b2b": 2000000, "b2g": 1000000 }, "goal": 3000000,
    "active": true, "hasBlackTier": true, "isDefault": true,
    "updatedBy": null, "updatedAt": "2026-11-11T12:00:00.000Z",
    "sales": { "count": 128, "total": 941952 }
  }
]
```

`sales`: quantidade e soma das vendas ativas no período.

### `POST /campaigns` e `PUT /campaigns/:id`

Master e admin (b2b/b2g → `403`). Body:

```json
{ "name": "Março", "start": "2027-03-01", "end": "2027-03-31", "goals": { "b2b": 5000, "b2g": 2000 }, "active": false, "hasBlackTier": false }
```

- `name` obrigatório (até 80 caracteres); datas reais no formato `AAAA-MM-DD`, com fim ≥ início; metas ≥ 0; campo a mais → `400`.
- `active: true` torna esta a ativa (e desmarca a anterior). No `PUT`, `active` ausente mantém como está; `active: false` na campanha ativa → `400` ("marque outra como ativa").
- `hasBlackTier: true`: o mês em que a campanha começa ganha a Meta black nas metas mensais, com as metas de setor dela (ver `/goals`).
- Resposta: a campanha salva (`201` no `POST`, `200` no `PUT`). Id inválido → `400`; inexistente → `404`.

### `DELETE /campaigns/:id`

Master e admin. A ativa → `409`; com retirada de prêmio registrada → `409`. As vendas não são apagadas (só deixam de ter essa campanha).

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

### `GET /logs` — Só master

Lista os **200 logs mais recentes**, do mais novo para o mais antigo (pelo horário de recebimento).

**Resposta:** `data: [{ _id, level, message, stack, componentStack, location, url, userAgent, occurredAt, createdAt, updatedAt }]`

---

## Usuários — `/users`

Ver e cadastrar: `master` e `admin`. Trocar perfil/senha e excluir: só `master`. `b2b`/`b2g` → `403` em todas. A senha nunca volta nas respostas.

### `GET /users`

**Resposta:** `data: [{ _id, email, role, createdAt, updatedAt }]`, ordenado por e-mail. Usuário antigo, sem perfil, vem como `admin`; o do `MASTER_EMAIL`, como `master`.

### `POST /users`

**Body** (validado por `CreateUserSchema`, não aceita campos extras):

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | sim | E-mail válido. Convertido para minúsculas e sem espaços. |
| `password` | string | sim | No mínimo 6 caracteres. |
| `passwordConfirmation` | string | sim | Igual a `password`, senão "Senhas são diferentes". |
| `role` | string | sim | `admin`, `b2b`, `b2g`, `vendor` ou `sdr` (`master` não existe no cadastro). |
| `vendorId` | string (id) | com `role: "vendor"` | Vendedor ligado à conta. |
| `sdrId` | string (id) | com `role: "sdr"` | Pessoa de passagem ligada à conta. |

**Resposta:** `201 data: { _id, email, role }` (+ `vendorId` ou `sdrId` nos colaboradores). E-mail já cadastrado → `409 Cadastro já realizado`. Colaborador sem a pessoa → `400`; pessoa que não existe → `400 Pessoa não encontrada`; pessoa que já tem conta → `409 Essa pessoa já tem uma conta`. Admin cadastrando o e-mail do `MASTER_EMAIL` → `400 Este e-mail é reservado` (senão viraria master).

### `PATCH /users/:id`

**Body** (`UpdateUserSchema`): `role` e/ou `password` + `passwordConfirmation` (pelo menos um dos dois). Nova senha derruba as sessões abertas da pessoa (refresh tokens revogados).

Ao trocar o `role` para `vendor`/`sdr`, mande também `vendorId`/`sdrId`; trocar para outro perfil tira a ligação com a pessoa.

Ninguém muda o próprio perfil (`400`); o master troca a própria senha. Não dá para promover a `master` (o perfil não existe no schema → `400`). Usuário que não existe → `404`.

### `DELETE /users/:id`

Exclui e revoga as sessões. A pessoa perde o acesso na hora. Ninguém se exclui (`400`). Usuário que não existe → `404`.

---

## Área do colaborador — `/me`

Só para os perfis `vendor` e `sdr` (os outros → `403`, sem login → `401`). A pessoa vem do usuário logado: não existe parâmetro para pedir dados de outra pessoa. Se a pessoa ligada à conta foi apagada do cadastro → `404 Pessoa não encontrada`.

### `GET /me`

`data: { kind: "vendor" | "sdr", id, name, job, imageUrl, team: { teamId, teamName, teamShirt } }`

### `GET /me/sales`

Vendedor: as vendas dele (todas, inclusive canceladas, como em `/sales/get/:vendorId`). Passagem: as vendas em que ele está em `sdrIds`. `data: { data: [vendas populadas], total }`.

### `GET /me/team`

| Parâmetro | Onde | Valores | Descrição |
|---|---|---|---|
| `period` | query | `all` \| `week` \| `lastWeek` | Campanha (padrão), semana atual ou passada. Outro valor = `all`. |

Mesma tabela de pontos do placar das TVs. **Só pontos, nenhum valor de venda.**

```json
{
  "period": "all",
  "team": { "position": 1, "teamId": "...", "teamName": "Orçawinx", "teamShirt": "...", "total": 15 },
  "teams": [{ "position": 1, "teamId": "...", "teamName": "Orçawinx", "teamShirt": "...", "total": 15 }],
  "people": [
    { "position": 1, "personId": "...", "kind": "vendor", "name": "...", "job": "...", "imageUrl": "...",
      "sales": 6, "farm": 0, "passage": 0, "total": 6, "isMe": true }
  ]
}
```

- `teams`: todos os times do maior para o menor (a posição do time da pessoa está em `team.position`).
- `people`: só as pessoas do time da pessoa, do maior para o menor; `isMe` marca a própria pessoa.

### `GET /me/prizes`

Os prêmios da própria pessoa, com o mesmo cálculo de `GET /prizes` (RN-66 e RN-67).

```json
{ "step": 10, "accumulated": 26, "currentWeek": 6, "earned": 2, "withdrawn": 2, "balance": 0, "pointsToNext": 4 }
```

- `accumulated`: todos os pontos até agora (de todos os setores, inclusive a semana em andamento).
- `withdrawn`: soma dos prêmios já retirados (registrados pelo master).
- `earned` / `balance` / `pointsToNext`: direitos, saldo (pode ficar negativo) e quanto falta para o próximo prêmio.

### `GET /me/goals`

As metas do mês do próprio vendedor (tela "Minhas metas"). `?month=AAAA-MM` (sem ele, o mês atual em São Paulo; formato errado → `400`). Mesma conta de `GET /goals/:month/progress` e `/history`, só com a parte dele:

```json
{
  "month": "2026-11", "today": "2026-11-11", "weeks": [...], "days": [...], "black": { "active": true, ... },
  "person": { "vendorId": "...", "month": {...}, "forecast": {...}, "weeks": [...], "cumulative": [...] },
  "history": { "month": "2026-11", "months": [{ "month": "2026-10", "start": "...", "end": "...", "people": [{ "vendorId": "...", "realized": 0, "tiers": null }] }] }
}
```

- `person`: o mesmo objeto de uma pessoa em `progress.people` (faixas, realizado, ritmo, forecast com quanto precisa por dia e a chance de cada faixa, semanas e acumulado por dia). `null` se ele não tem meta no mês (e sempre `null` para pessoa de passagem).
- `history.months[].people`: só ele (lista vazia se não estava no mês). Nenhum dado de outro vendedor vem na resposta.
- Usa o mesmo cache de 5 segundos do progresso das metas: muitos vendedores abrindo juntos fazem a conta do mês uma vez só.

---

## Prêmios — `/prizes`

A cada `PRIZE_POINTS_STEP` pontos (padrão 10) a pessoa ganha 1 prêmio. Vendedores e pessoas de passagem (SDR, CS, Suporte), com os pontos de `/analytics/people-points`, de todos os setores. Os pontos são cumulativos e contam todos até agora, inclusive os da semana em andamento. Regras em RN-66 a RN-68.

Ver: `master`, `admin`, `b2b`, `b2g` (b2b/b2g só as pessoas com cargo do setor; CS e Suporte só para master e admin). Registrar e excluir: só `master` (os outros → `403`). Sem login → `401`.

### `GET /prizes`

| Parâmetro | Onde | Valores | Descrição |
|---|---|---|---|
| `segment` | query | `b2b` \| `b2g` | Só master e admin (b2b/b2g sempre recebem o próprio setor). |

```json
{
  "segment": null,
  "step": 10,
  "today": "2026-11-09",
  "currentWeek": { "start": "2026-11-09", "end": "2026-11-15" },
  "teams": [{ "teamId": "...", "teamName": "...", "teamShirt": "..." }],
  "people": [
    { "personId": "...", "kind": "vendor", "name": "...", "job": "B2B Venda", "imageUrl": "...", "teamId": "...",
      "accumulated": 15, "currentWeek": 3, "earned": 1, "withdrawn": 0, "balance": 1,
      "debtPoints": 0, "nextPrizeAt": 20, "pointsToNext": 5 }
  ]
}
```

- `accumulated`: todos os pontos até agora, inclusive a semana em andamento. `currentWeek`: só os pontos da semana em andamento (informação; já estão no `accumulated`).
- `earned` = `accumulated ÷ step` (para baixo). `balance` = `earned − withdrawn` (negativo = devendo; `debtPoints` diz quantos pontos).
- `pointsToNext`: quanto falta para o próximo prêmio.
- Ordem: maior saldo primeiro, depois mais pontos, depois nome.

### `GET /prizes/withdrawals`

Histórico de retiradas, da mais recente para a mais antiga. Filtro opcional por pessoa: `?kind=vendor|sdr&personId=<id>`.

`data: [{ _id, personId, kind, name, job, quantity, withdrawnAt, createdBy, createdAt }]` (pessoa apagada do cadastro vem como "Pessoa removida").

### `POST /prizes/withdrawals` — Só master

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `personId` | string (id) | sim | Vendedor ou pessoa de passagem. |
| `kind` | string | sim | `vendor` ou `sdr`. |
| `quantity` | inteiro | sim | De 1 a 100. |
| `withdrawnAt` | string | sim | Dia da retirada, `AAAA-MM-DD`. |
| `confirmOverBalance` | boolean | não | Obrigatório como `true` quando a quantidade passa do saldo. |

**Resposta:** `201 data: { _id, personId, kind, quantity, withdrawnAt, createdBy, ... }`. Campo inválido ou a mais (o prêmio em si não é cadastrado) → `400`. Pessoa que não existe → `404 Pessoa não encontrada`. Acima do saldo sem confirmação → `409 Fulano tem saldo de 1 prêmio. Confirme para registrar mesmo assim`.

### `DELETE /prizes/withdrawals/:id` — Só master

Exclui um lançamento errado; o saldo se recalcula. Retirada que não existe → `404`.

---

## Metas mensais — `/goals`

Metas em R$ por setor, por vendedor e por semana, com três faixas: Meta, Super meta e Meta black (a black só no mês em que começa uma campanha marcada com Meta black, `hasBlackTier` em `/campaigns`). **Modelo de níveis** (planilha do comercial, desde 11/11/2026): cada setor tem uma tabela de níveis para Farmer e outra para Venda, com **Meta e Super em R$** e a divisão da meta por origem (% de antecipação, up-sell e churn); cada vendedor recebe a Meta e a Super do nível dele (o gestor pode ajustar à mão), e a parte de cada tipo é a soma das pessoas. Há também o ticket médio e a taxa de conversão de leads (%) de cada tipo, para "quantas vendas faltam" e "quantos leads faltam" (planilha de vendas: leads = o que falta ÷ (ticket × conversão), com 30% em Venda). A Meta black do setor é a meta do setor nessa campanha (a mesma das TVs): o gestor só diz quanto dela é de Farmer (`farmBlack`) e Venda fica com o resto; a Black de cada parte vai para as pessoas na proporção da Meta de cada uma. **A meta da semana é recalculada** no começo de cada semana: o que falta para cada faixa do mês ÷ semanas que faltam (semana que ainda não começou usa o vendido até hoje). **"Quanto precisa por dia" e o forecast do mês contam só dias úteis** (segunda a sexta, sem feriados). Meses salvos no modelo antigo (pesos, `superPercent` e semanas digitadas) continuam com a Meta e a Super salvas de cada pessoa, mas já com a semana recalculada e os dias úteis. Regras em RN-69 a RN-73. **Fase de teste com o gestor: só `master` e `admin`** (b2b, b2g, vendor e sdr → `403`; sem login → `401`). Não mexe na meta das TVs (`BLACK_FRIDAY_GOAL*` do `.env`). Mês fora do formato `AAAA-MM` ou setor diferente de `b2b`/`b2g` → `400`.

### `GET /goals/:month`

Para a tela de cadastro.

```json
{
  "month": "2026-11",
  "weeks": [{ "index": 0, "start": "2026-11-02", "end": "2026-11-08" }],
  "black": { "month": "2026-11", "active": true, "total": 3000000, "sectorGoals": { "b2b": 2000000, "b2g": 1000000 } },
  "segments": {
    "b2b": {
      "config": { "month": "2026-11", "model": "levels", "farmGoal": 26000, "salesGoal": 82000, "farmSuper": 32500, "salesSuper": 100000,
        "superPercent": null, "farmBlack": 80000, "salesBlack": 120000, "tickets": { "farm": 2000, "sales": 3000 }, "conversion": { "farm": null, "sales": 30 },
        "levels": [{ "key": "junior", "name": "Júnior", "type": "farm", "goal": 87625, "superGoal": 109531.25, "anticipation": 60, "upsell": 10, "churn": 20, "weight": null }],
        "people": [{ "vendorId": "...", "type": "farm", "level": "junior", "goal": 87625, "superGoal": 109531.25, "blackGoal": null, "weeks": [] }],
        "updatedBy": "admin@...", "updatedAt": "..." },
      "previous": null,
      "vendors": [{ "vendorId": "...", "name": "...", "job": "B2B Venda", "imageUrl": "...", "teamId": "...", "teamName": "...", "type": "sales" }]
    },
    "b2g": { "config": null, "previous": { "month": "2026-10", "...": "..." }, "vendors": [] }
  }
}
```

- `weeks`: semanas (segunda a domingo) que **começam** no mês; a última pode terminar no mês seguinte.
- `black.active`: no mês começa uma campanha com Meta black. `black.campaign`: `{ id, name }` dela (ou `null`); `black.month`: o mês (ou `null`). `sectorGoals`: a meta de cada setor dessa campanha (`0` sem campanha ou sem meta). O `salesBlack` do `config` é só registro: o progresso sempre usa a Black do setor da campanha − `farmBlack`. Salvar o mês com Meta black e a campanha sem meta do setor → `400`.
- `config`: o que está salvo (ou `null`). `model`: `"levels"` (modelo de níveis) ou `"weights"` (mês salvo no modelo antigo, com `levels[].weight`, `superPercent` e `people[].weeks`; a tela converte para níveis ao abrir). `farmSuper`/`salesSuper`: a Super de cada parte (soma das pessoas). `previous`: sem `config`, o último mês salvo antes deste, para a tela copiar.
- `vendors`: vendedores do setor pelo cargo (`"B2B ..."` / `"B2G ..."`); `type` = `farm` se o cargo tem "Farmer", senão `sales`.

### `PUT /goals/:month/:segment`

Body (`strictObject`): `{ levels: [{ key, name, type: "farm" | "sales", goal, superGoal, anticipation?, upsell?, churn? }], tickets?: { farm, sales }, conversion?: { farm, sales }, farmBlack?, people: [{ vendorId, level, goal, superGoal, blackGoal? }] }` (valores em R$; percentuais de 0 a 100, padrão 0; ticket `null` = sem ticket; conversão de 0 (exclusivo) a 100%, `null` = sem conversão). `goal`/`superGoal` da pessoa são os finais (os do nível ou ajustados à mão); `blackGoal` só é gravado no mês com Meta black (sem ele, a parte proporcional à Meta); `farmBlack` também, junto com `salesBlack` = Black do setor − `farmBlack`. O backend grava `farmGoal`/`salesGoal` e `farmSuper`/`salesSuper` como a soma das pessoas de cada tipo, `superPercent: null` e `weeks: []`. Campo do modelo antigo (`superPercent`, `weight`, `weeks`) → `400`. Substitui o mês inteiro daquele setor (os outros meses não mudam). Só salva quando tudo fecha (senão `400` com a mensagem):

- pelo menos um nível; nível repetido (mesma chave no mesmo tipo) → `"Há níveis repetidos"`; Super do nível ≥ Meta (ex.: `"Vendas · Júnior: a Super meta não pode ser menor que a Meta (R$ 4.000,00)"`); antecipação + up-sell + churn ≤ 100%;
- cada vendedor existe, é do setor, aparece uma vez e tem um nível **do tipo dele** (ex.: `"Escolha um nível de Vendas válido para Fulano"`); Super ≥ Meta da pessoa;
- a meta do setor (soma das pessoas) > 0;
- no mês com Meta black: a meta do setor na campanha cadastrada, `farmBlack` ≤ a Black do setor e, em cada parte com Meta, a Black > a Super dela (ex.: `"Vendas: a Meta black precisa ser maior que a Super meta (R$ 1.500,00)"`); a Black de cada pessoa ≥ a Super dela; a soma das Blacks de cada parte = a Black da parte, no centavo (ex.: `"Meta black Vendas: distribuído R$ 2.500,00 de R$ 3.000,00"`).

Responde o `config` salvo, com `updatedBy` = e-mail de quem salvou.

### `DELETE /goals/:month/:segment`

Exclui o mês daquele setor. Não existe → `404`.

### `GET /goals/:month/progress`

Progresso do mês (vendas `ativa`, pelo `realizedAt` no horário de São Paulo, dentro das semanas do mês). Cada vendedor conta só as vendas dele do tipo do cargo (`farm` ou `sales`).

```json
{
  "month": "2026-11", "today": "2026-11-09", "weeks": [], "days": ["2026-11-02", "..."], "black": { "active": true, "...": "..." },
  "total": { "goal": 270000, "parts": { "farm": "...", "sales": "..." }, "month": "<progresso>", "forecast": "<forecast>",
    "weeks": ["<progresso da semana>"], "cumulative": [] },
  "segments": [{ "segment": "b2b", "goal": 120000, "superPercent": 125,
    "parts": { "farm": { "goal": 48000, "...": "<progresso>" }, "sales": { "goal": 72000, "...": "<progresso>" } },
    "month": "<progresso>", "forecast": "<forecast>", "weeks": ["<progresso da semana>"], "cumulative": [0, 1200] }],
  "people": [{ "vendorId": "...", "segment": "b2b", "type": "sales", "name": "...", "job": "...", "imageUrl": "...",
    "teamId": "...", "teamName": "...", "level": "junior", "levelName": "Júnior", "ticket": 2000,
    "origins": { "anticipation": { "percent": 60, "value": 52575 }, "upsell": { "percent": 10, "value": 8762.5 }, "churn": { "percent": 20, "value": 17525 } },
    "month": "<progresso>", "forecast": "<forecast>", "weeks": ["<progresso da semana>"], "cumulative": [] }],
  "teams": [{ "teamId": "...", "teamName": "...", "imageUrl": "...", "members": 4, "month": "<progresso>", "cumulative": [] }],
  "summary": { "people": 11, "reachedGoal": 3, "reachedSuper": 3, "reachedBlack": 2, "onPace": 4, "behind": 7 }
}
```

`<progresso>`: `{ realized, tiers: { goal, super, black }, available, reached: ["goal", ...], current: "goal" | "super" | "black", target, percent, remaining, excess, salesNeeded?, leadsNeeded?, pace: { totalDays, elapsedDays, remainingDays, daysToGo, expected, status: "done" | "ahead" | "behind" | "upcoming", neededPerDay, projection } }`.

- `available`: as faixas do mês (`["goal", "super"]` fora do mês da campanha; com `"black"` nele). `current`: a primeira ainda não batida; bateu todas, fica na última e o que passou dela vai em `excess`. `percent` é do `target` (a faixa atual).
- `parts`: progresso de Farmer e de Venda, cada um com as próprias faixas. `goal` do setor = soma das partes.
- `tiers` da pessoa: a Meta, a Super e a Black são as que o gestor salvou (`superGoal`/`blackGoal`). Mês salvo antes desses campos: a Super e a Black da parte são divididas na proporção da Meta de cada um. Se a meta do setor na campanha mudar depois do cadastro, a Black de cada pessoa acompanha na mesma proporção.
- Semanas da pessoa: a faixa da semana = (faixa do mês − vendido antes da semana começar) ÷ semanas que faltam, inclusive ela; semana que ainda não começou usa o vendido até hoje. Faixa do mês já batida antes da semana → 0 na semana. As semanas do setor, do time e do total são a soma das pessoas.
- `pace` é em relação à Meta (faixa normal), em **dias úteis** (segunda a sexta, sem feriados): `elapsedDays` inclui hoje; `expected` = quanto já deveria ter até hoje; `daysToGo` = dias úteis de hoje (inclusive) até o fim; `neededPerDay` = quanto falta ÷ `daysToGo`; `projection` = ritmo atual até o fim.
- `ticket` e `salesNeeded` (só da pessoa, quando o mês tem ticket do tipo dela): quantas vendas faltam para a faixa atual = `remaining` ÷ ticket, arredondado para cima. `conversion` e `leadsNeeded` (com ticket e conversão do tipo): quantos leads faltam = `remaining` ÷ (ticket × conversão%), para cima. `origins` (modelo de níveis): quanto da Meta do mês vem de antecipação, up-sell e churn, pelo % do nível; `null` no modelo antigo.
- `people` vem do mais perto para o mais longe da Meta; `teams` = soma das pessoas de cada time; `cumulative` = acumulado por dia (`days`).
- `total`: os setores somados (o "Todos" do admin), no mesmo formato de um setor. `null` em mês sem meta.
- Mês sem meta: listas vazias e `summary` zerado.

`<forecast>` (no total, em cada setor e em cada pessoa): `{ productiveDays: { elapsed, remaining }, pace: { current, last7, last30, month }, scenarios: { pessimistic, realistic, optimistic }, dailyStdDev, tiers: { goal: { target, requiredPace, paceCoverage, gap, probability }, super: {...}, black: {...} }, trajectory: { pessimistic: [...], realistic: [...], optimistic: [...] } }`.

- Mesmo cálculo do `/analytics/forecast` (`monthForecast` em [goalCalculator.js](features/goals/service/goalCalculator.js)), com o modelo do setor (`config/forecastModels.js`; o B2G usa o do B2B por enquanto) para o setor e as pessoas dele; o total é a soma dos setores (`combineMonthForecasts`), como no `/analytics/forecast`. Aplicado ao mês da meta: dias úteis (segunda a sexta, sem feriados de `config/campaign.js`) dentro das semanas do mês; venda no fim de semana ou feriado entra no dia útil anterior; hoje conta como dia que passou. (O `/analytics/forecast` da campanha continua de segunda a sábado.)
- `pace.current` = média dos últimos 7 dias produtivos × 50% + dos últimos 30 × 30% + do mês × 20%. `scenarios` = realizado + ritmo × fator (0,8 / 1 / 1,2) × dias produtivos que faltam.
- `tiers`: uma entrada por faixa do mês (`available`). `requiredPace` = (faixa − realizado) ÷ dias produtivos que faltam (`null` sem dias); `paceCoverage` = ritmo ÷ necessário (%); `gap` = faixa − realista (negativo = acima); `probability` (%) = chance de chegar na faixa pela normal (desvio dos últimos 30 dias produtivos). Já batida → 100; mês encerrado sem bater → 0; menos de 2 dias produtivos → `null`.
- `trajectory`: um valor por dia de `days`, `null` antes de hoje; de hoje em diante, o acumulado projetado em cada cenário.

### `GET /goals/:month/history`

Histórico mês a mês para o gráfico "Mensal": o mês escolhido e os anteriores (`months`, de 1 a 12; padrão 6; outro valor → `400`). Cada mês são as semanas que começam nele.

```json
{
  "month": "2026-11", "black": { "...": "..." },
  "months": [{ "month": "2026-10", "start": "2026-10-05", "end": "2026-11-01",
    "total": { "realized": 6500, "tiers": { "goal": 10000, "super": 12000, "black": 0 } },
    "segments": { "b2b": { "realized": 6500, "tiers": { "...": "..." } }, "b2g": { "realized": 0, "tiers": null } },
    "people": [{ "vendorId": "...", "segment": "b2b", "type": "sales", "realized": 5500, "tiers": { "...": "..." } }] }]
}
```

- Mês com meta no setor: conta as pessoas cadastradas, cada uma no tipo dela, com as faixas do cadastro (Black só no mês da campanha).
- Mês sem meta no setor: conta os vendedores do setor pelo cargo de hoje, cada um no tipo do cargo, e `tiers` vem `null`. `total.tiers` é a soma dos setores com meta (`null` se nenhum tiver).

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
