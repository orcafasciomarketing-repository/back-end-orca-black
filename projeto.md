Dashboard Black Friday — Regras de Negócio e Requisitos

Instrução para quem for alterar o código (humano ou IA): Este documento descreve decisões já tomadas. Itens marcados como ⚠️ PENDENTE ainda não foram decididos: não implemente suposições sobre eles, pergunte antes. Quando o documento disser "conferir no código", verifique o nome real no projeto em vez de assumir.

1. Contexto
   Dashboard interno exibido em telas (slides) durante o plantão da Black Friday.
   Vida útil: cerca de 1 mês. Depois da campanha, o sistema é desligado. Não construir funcionalidades pensando em longo prazo (YAGNI).
   As vendas são anotadas pelo comercial numa planilha Google Sheets. Um Apps Script na planilha envia as linhas para o backend (POST /sales/webhook/sheet).
   Mudança em 27/10/2026: o comercial deixou de usar o RD Station CRM. O webhook da RD, o STAGE_MAP e o custom field de passagem foram removidos (estão no histórico do git, branch main).
   As telas ficam ligadas o tempo todo consultando o backend (isso mantém o serviço ativo no Render).
   Ninguém muda de time durante a campanha.
   Stack
   Camada Tecnologia
   Backend Node.js, Express 5 (erros em funções async chegam sozinhos ao middleware de erros)
   Banco MongoDB com Mongoose
   Tempo real SSE (shared/sseManager, função broadcast)
   Hospedagem Render (roda em UTC)
   Origem dos dados Planilha Google Sheets + Apps Script
   Arquitetura em camadas
   Camada Responsabilidade
   Controller Apenas HTTP: valida o secret, chama o service, devolve o resultado de cada linha.
   Adapter Única parte que conhece as colunas da planilha (sheetRowAdapter). Função pura: traduz a linha para o objeto do sistema.
   Service Regras de negócio: decide ativa/cancelada, busca vendor e passagem pelo nome, decide o broadcast.
   Repository Única parte que fala com o Mongoose. Traduz detalhes do Mongo (ex.: erro E11000) para resultados neutros.
   Config Leitura de variáveis de ambiente.
2. Entidades
   2.1 Sale (model "Sales")
   Os nomes com prefixo rd foram mantidos (o front do admin lê rdDealName, rdDealId, realizedAt e dealStatus). Hoje os dados vêm da planilha.
   Campo Tipo Regras
   rdDealId String Obrigatório, único (índice único). Coluna "Id da venda" (UUID gerado pelo Apps Script). Chave da idempotência.
   rdDealName String Opcional. Coluna "Id da empresa" (mostrado como "Negociação" no admin).
   vendorId ObjectId → "Vendors" Obrigatório. \_id do vendor encontrado pelo nome (coluna "Vendedor").
   value Number Obrigatório. Coluna "Valor da venda".
   sdrIds [ObjectId] → "SDR" Lista (padrão vazia). Pessoas da coluna "Passagens" (SDR, Suporte ou CS). Lista vazia = sem passagem.
   rdUpdatedAt Date Obrigatório. Coluna "Atualizado em" (momento do envio, colocado pelo Apps Script). Usado para ordenar os envios.
   segment String enum ["b2b", "b2g"] Obrigatório. Coluna "Setor". Hoje não é usado em nenhuma tela, mas é mantido.
   funnelType String enum ["farm", "sales"] Obrigatório. Coluna "Classificação": "Renovação" = farm; vazia (venda nova) = sales.
   realizedAt Date Obrigatório. Coluna "Data da venda". Pode ser corrigida na planilha. Base dos filtros de período.
   dealStatus String enum ["ativa", "cancelada"] Obrigatório. Coluna "Status": "Concluída" = ativa; "Cancelada" (ou qualquer outro) = cancelada.
   createdAt / updatedAt Date Gerados pelo Mongoose (timestamps: true). Indicam alterações no banco.

2.2 Vendor (model "Vendors")
Vendedor. Pertence a um team (teamId).
Encontrado pelo vendorName, que é único (índice único sparse) e precisa ser igual ao texto da coluna "Vendedor" da planilha.
rdUserId continua no model (obrigatório e único) por causa do seed, mas não é mais usado.
Possui job (informativo; o ranking de artilheiros separa pelo funnelType da venda, não pelo job).
Cadastrados via seed.
2.3 SDR (model "SDR")
Coleção única para SDR, Suporte e CS, diferenciados pelo campo job.
Essas pessoas só pontuam por passagens.
Pertencem a um team (teamId).
São encontrados pelo name, que é único (índice único) e igual ao texto usado na coluna "Passagens".
Cadastrados via seed.
2.4 Team
Time. Possui name e imageUrl (escudo exibido no card).
Vendors e SDRs apontam para o team. A venda não guarda o team: ele é obtido pelo vendor (ou pela pessoa da passagem).
2.5 O que NÃO é entidade
Linha da planilha: conceito externo. Entra pelo adapter e vira uma Sale.
Mapa de pontos: configuração.
Meta: configuração (variável de ambiente), pois é única e não muda. 3. Configuração (variáveis de ambiente)

Devem existir no .env local e nas variáveis de ambiente do Render.

Variável Uso
WEBHOOK_SECRET Segredo do envio da planilha. Nunca logar. Sem ela, o backend recusa todos os envios.
O Apps Script manda o mesmo valor do WEBHOOK_SECRET, guardado nas Propriedades do script. Trocar o segredo exige atualizar também a planilha.
POINTS_PER_SALE Pontos por venda do tipo sales (definido: 2).
POINTS_PER_FARM Pontos por venda do tipo farm (definido: 1).
POINTS_PER_PASSAGE Pontos por pessoa da passagem (definido: 1).
BLACK_FRIDAY_GOAL Meta da Black (valor em reais). Lida em config/goal.js com Number(process.env.BLACK_FRIDAY_GOAL ?? 0).

As variáveis da RD (B2B_FUNIL_*, B2G_FUNIL_*, RD_PASSAGE_CUSTOM_FIELD_ID) não são mais usadas e podem ser apagadas.

3.1 config/points.js
Exporta { pointsMap }.
pointsMap é um Map com as chaves "sales", "farm" e "passage".
Valores convertidos com Number(process.env.X ?? 0). Padrão 0 se a variável não existir.
O sistema deve funcionar com qualquer valor configurado. Não fixar valores no código. 4. Regras de negócio
4.1 O que é uma venda
RN-01: Cada linha da planilha com Status "Concluída" é uma venda ativa. A comparação ignora acento, maiúscula e espaço.
RN-02: Status "Cancelada" (ou qualquer valor diferente de "Concluída") deixa a venda cancelada, se ela existir. Linha que nunca foi concluída não vira venda.
RN-03: O Apps Script só envia linhas concluídas ou que já foram concluídas antes (que têm "Id da venda"). Linhas nunca concluídas não chegam ao backend.
4.2 Ciclo de vida da venda
RN-04 (criação): primeira vez que a linha chega como "Concluída" → venda criada como ativa (popup).
RN-05 (correção): qualquer coluna editada (valor, data, vendedor, passagens, setor, classificação) → venda atualizada, esteja ela ativa ou cancelada.
RN-06 (cancelamento): Status diferente de "Concluída" → venda marcada como cancelada. Nunca apagar (soft delete). Com os dados completos, a venda também recebe os dados novos; com dados faltando, só o status muda.
RN-06b: Nunca apagar a linha na planilha para cancelar (o Apps Script não avisa quando uma linha é apagada). Para cancelar, mude o Status.
RN-07 (reativação): linha volta para "Concluída" → venda volta a ativa (sem popup).
RN-08 (troca de setor/classificação): segment e funnelType são atualizados.
RN-09 (data da venda): realizedAt é a coluna "Data da venda". Corrigir a data na planilha atualiza a venda (e a semana em que ela conta).
RN-10: Vendas canceladas não contam em nenhuma tela.
RN-10b (validação): linha concluída sem "Id da venda", "Atualizado em", vendedor cadastrado, Setor B2B/B2G, valor numérico ≥ 0 ou data válida não é gravada. A resposta diz o problema de cada linha (aparece no log do Apps Script). Uma linha com erro não impede as outras do mesmo envio.
4.3 Idempotência e ordem dos envios
RN-11: O Apps Script envia a cada edição (acionador "Ao editar") e reenvia a planilha inteira a cada 10 minutos (sincronização). A mesma linha chega muitas vezes, inclusive ao mesmo tempo.
RN-12: Reenvios não podem duplicar vendas nem gerar popups repetidos. Garantia: índice único em rdDealId ("Id da venda").
RN-13: Um envio é aplicado quando o seu "Atualizado em" é mais novo OU IGUAL ($lte) ao rdUpdatedAt salvo. Só envios estritamente mais antigos (fora de ordem) são ignorados.
RN-14: "Id da venda" é um UUID gerado pelo Apps Script na primeira vez que a linha fica "Concluída". Nunca usar o número da linha (muda ao ordenar, inserir ou apagar linhas). Linha copiada e colada recebe um id novo.
RN-15: Datas sempre salvas como Date, nunca como string.
4.4 Vendedor
RN-16: O vendedor é encontrado pelo nome (coluna "Vendedor" = vendorName, comparação exata).
RN-17: Vendedor não cadastrado → linha concluída não é gravada; a resposta traz o erro "Vendedor "<nome>" não cadastrado".
4.5 Passagem
RN-18: Uma venda pode ter zero, uma ou várias pessoas na passagem. Cada pessoa conta uma vez por venda (nome repetido é ignorado).
RN-19: Coluna "Passagens": nomes separados por vírgula ("Ana, Caio"), formato da lista suspensa com várias seleções do Sheets. Uma lista JSON também é aceita. Vazio = sem passagem.
RN-20: A passagem só existe junto com a venda. Ela fica dentro do documento da Sale (sdrIds), não em coleção separada. Se a venda for cancelada, a passagem deixa de contar.
RN-21: As pessoas da passagem são buscadas na coleção SDR pelo name (comparação exata). Nome não cadastrado é descartado (sem log) e a venda segue com os nomes que existem. A ordem da lista é a mesma da planilha.
RN-22: Todo envio grava a lista inteira em sdrIds ($set). Pessoa tirada da coluna sai da venda; lista vazia = sem passagem.
4.6 Pontuação
RN-23: Venda sales vale POINTS_PER_SALE pontos.
RN-24: Venda farm (Renovação) vale POINTS_PER_FARM pontos.
RN-25: Cada pessoa da passagem vale POINTS_PER_PASSAGE pontos (venda com 2 pessoas = 2 × POINTS_PER_PASSAGE).
RN-26: Pontos não são gravados na venda. São calculados na leitura, a partir do pointsMap. Assim, se os valores mudarem, valem para todas as vendas imediatamente.
RN-27: Pontos de venda/renovação vão para o time do vendedor.
RN-28: Os pontos de cada pessoa da passagem vão para o time dela (pode ser diferente do time do vendedor). Duas pessoas do mesmo time na mesma venda = o time ganha os pontos das duas.
4.7 Períodos
RN-29 (semanal): semana de segunda a domingo, no fuso America/Sao_Paulo (o servidor roda em UTC). O ranking "zera" na segunda apenas por filtro de data; nenhum dado é apagado.
RN-30 (geral): todas as vendas ativas da campanha, sem filtro de data.
RN-31: Os filtros de período usam realizedAt, nunca rdUpdatedAt (uma correção de valor não pode mover a venda de semana).
RN-32: Consultas de ranking usam todas as vendas do período, sem paginação.
4.8 Meta
RN-33: Existe uma única meta para a Black inteira, e ela não muda durante a campanha.
RN-34: A meta mora numa variável de ambiente do backend e chega ao front pela API. O front não tem a meta no código nem numa variável própria (fonte única da verdade).
RN-35: Progresso = soma do value das vendas ativas (campanha toda, sem filtro de período) em relação à meta. O backend calcula o percentual; o front só exibe. Percentual com 2 casas decimais, sem teto (passa de 100 se a meta for batida). Meta 0 ou não configurada → percent 0.
4.9 Popup (SSE)
RN-36: O SSE (GET /sales/events) envia dois tipos de evento. Venda nova: { sale: { _id, funnelType }, vendor: { vendorName, job, imageUrl }, sdrs?: [{ name, job, imageUrl }], sdr?: { name, job, imageUrl } } → as telas atualizam e o popup aparece. sdrs é a lista de todas as pessoas da passagem; sdr é a primeira da lista, mantido para o popup atual do front (que só mostra uma pessoa) e que deve sair quando o front mostrar a lista. Venda alterada (cancelada, reativada ou corrigida): { type: "sale-updated" } → as telas só atualizam, sem popup.
RN-37: O evento de venda nova dispara somente quando a venda é criada (created: true). Reenvios (sincronização), correções, cancelamentos e reativações nunca abrem popup.
RN-38: Os dados das telas continuam vindo das consultas ao backend; o SSE só avisa as telas que é hora de buscar de novo. Quando nada muda no banco (linha cancelada que nunca foi concluída, linha com erro, envio atrasado), nenhum evento é enviado. Num lote com várias alterações, vai um único { type: "sale-updated" } (a sincronização reenvia a planilha inteira e as TVs não precisam buscar os dados N vezes); cada venda nova gera o seu evento de popup.
RN-39: O evento leva só os campos que o popup usa (o SSE vai para todas as telas conectadas): nada de valor, empresa, id da venda ou dados internos. sdrs e sdr só existem quando a venda tem passagem.
4.10 Logs de erro do front
RN-40: O front envia os erros das TVs para POST /logs (pública, 60 por minuto por IP) e o admin lê em GET /logs (privada, 200 mais recentes). Logs são apagados 30 dias depois de recebidos (índice TTL em createdAt). Contrato no ERROS_E_LOGS.md do front. 5. Fluxo da planilha (implementado)
5.1 Apps Script (na planilha)
Acionador "Ao editar" (aoEditarPlanilha): envia as linhas editadas que estão "Concluída" ou que já têm "Id da venda". Gera o "Id da venda" (UUID) na primeira vez e grava na planilha.
Acionador de tempo a cada 10 min (sincronizarTudo): reenvia a planilha inteira (rede de segurança se o backend estava fora do ar).
Envia em lotes de 50 linhas, como lista JSON, com "Atualizado em" (momento do envio) e o header webhook_secret com o segredo (Propriedades do script).
5.2 Controller (sheetSaleEntry)
Header webhook_secret (ou x-webhook-secret) comparado com o WEBHOOK_SECRET usando timingSafeEqual (shared/webhookSecretService.js). Segredo ausente no servidor, header ausente ou diferente → 401 "Acesso negado".
Aceita uma lista de linhas ou uma linha solta.
Responde 200 com o resultado de cada linha: { linha, idVenda, status: "criada" | "atualizada" | "cancelada" | "ignorada" | "erro", mensagem? }.
Erros inesperados sobem para o middleware de erros (Express 5) → não-2xx → o Apps Script registra no log; a sincronização reenvia.
5.3 Adapter (translateSheetRow(row), findSaleDataErrors(sale))
Função pura.

Campo de saída Origem na linha
rdDealId "Id da venda"
rdDealName "Id da empresa"
rdUpdatedAt "Atualizado em" (null se inválido)
realizedAt "Data da venda" (null se inválida)
value "Valor da venda" (NaN se vazio ou não numérico)
vendorName "Vendedor"
rdPassageNames "Passagens" separadas por vírgula, sem vazios e sem repetidos
segment "Setor": B2B → b2b, B2G → b2g, outro → null
funnelType "Classificação": Renovação → farm, outro/vazio → sales
isConcluded "Status" = Concluída
sheetRow "linha" (só para o log)

findSaleDataErrors devolve a lista de problemas: vendedor vazio, setor inválido, valor inválido, data inválida.
5.4 Service (sheetSalesProcess(rows))
Para cada linha, uma por vez:

dados = adapter(linha)
sem rdDealId ou rdUpdatedAt → erro
problemas = findSaleDataErrors(dados) + vendedor não cadastrado

se não é Concluída:
  sem problemas → updateCanceledByDealId(dados com vendorId e sdrIds) (cancela e atualiza os dados)
  com problemas → cancelByDealId(rdDealId, rdUpdatedAt) (só cancela)
  fim da linha

se tem problemas → erro (nada gravado)
dados.vendorId = vendor._id
dados.sdrIds = SDRs encontrados pelos nomes, na ordem da planilha
{ sale, created } = upsertActiveByDealId(dados)

Depois do lote: broadcast({ sale, vendor, sdrs?, sdr? }) para cada venda criada; um único broadcast({ type: "sale-updated" }) se alguma venda foi alterada.
5.5 Repository

upsertActiveByDealId(sale)

Filtro: rdDealId igual e rdUpdatedAt $lte o do envio.
$set: rdDealName, value, vendorId, segment, funnelType, rdUpdatedAt, realizedAt, dealStatus: "ativa" e sdrIds (lista inteira).
Opções: upsert: true, returnDocument: "after", runValidators: true, includeResultMetadata: true.
Retorno: { sale: result.value, created: !result.lastErrorObject.updatedExisting }.
Erro 11000 (envio mais antigo que o salvo: o filtro não acha a venda e o upsert tenta criar outra com o mesmo rdDealId) → retorna { sale: null, created: false }. Qualquer outro erro é relançado.

updateCanceledByDealId(sale)

Linha cancelada com os dados completos. Sem upsert (nunca cria documento).
Filtro: rdDealId igual e rdUpdatedAt $lte o do envio (qualquer dealStatus).
$set: os mesmos dados do upsertActiveByDealId, com dealStatus: "cancelada".

cancelByDealId(rdDealId, rdUpdatedAt)

Linha cancelada com dados faltando. Sem upsert (nunca cria documento).
Filtro: rdDealId igual, rdUpdatedAt $lte o do envio, dealStatus: "ativa".
$set: dealStatus: "cancelada", rdUpdatedAt.
5.6 Tabela de comportamento esperado (cenários de teste)
Linha na planilha Resultado no banco Popup
Concluída pela primeira vez venda criada, ativa sim
Reenviada (sincronização) sem mudança dados reaplicados, sem duplicar não
Valor, data, passagens, setor ou classificação corrigidos dados atualizados não
Status muda para Cancelada cancelada, dados atualizados não
Cancelada com dados faltando só cancela não
Volta para Concluída ativa de novo não
Cancelada sem nunca ter sido concluída nada salvo não
Envio antigo chega depois de um mais novo nada muda não
Vendedor não cadastrado / dado faltando (Concluída) nada salvo, erro na resposta não
Lote com uma linha errada as outras são gravadas sim (para as novas)
6. Requisitos funcionais (telas)
RF-01 — Meta Black
Barra de progresso com o total vendido (soma de value das vendas ativas) e a meta.
A meta vem do backend (RN-34).
Rota: GET /analytics/goal → data: { goal, total, percent }.
RF-02 — Ranking de equipes (semanal e geral)

Um card por time, ordenados por total de pontos (decrescente). Cada card mostra:

Informação Regra
Nome e escudo do time do documento Team (name, imageUrl)
Total de pontos soma das três categorias abaixo, calculada depois de somar as categorias
Vendas pontos de vendas sales (B2B + B2G juntos) dos vendors do time
Renovação pontos de vendas farm (B2B + B2G juntos) dos vendors do time
Passagens pontos de passagens (SDR + Suporte + CS juntos) feitas por pessoas do time

Formato de retorno por time: { teamId, teamName, teamShirt, sales, farm, passage, total }. teamShirt = Team.imageUrl.

Regras de implementação:

Todo time aparece, mesmo com zero pontos.
Tabelas de consulta: id do vendor → id do time; id da pessoa da passagem → id do time.
Pontos somados com pointsMap (nunca ++ fixo).
A passagem é processada independentemente do vendor (fora do if do time do vendor).
Os nomes das categorias no objeto do time (sales, farm, passage) são iguais às chaves do pointsMap e aos valores de funnelType.
RF-03 — Ranking de artilheiros (Vendas e Farmer, semanal e geral)
Top 3 por pontos.
Separação pelo funnelType da venda: o ranking de Vendas soma só vendas sales e o de Farmer só vendas farm. Um vendedor com os dois tipos pode aparecer nos dois rankings.
Sem critério de desempate (empate fica na ordem que vier do banco).
Query string: vendorDepartment=farm → farm; qualquer outro valor → sales.
RF-04 — Ranking de SDR / passagens
Top 3 por pontos de passagem: cada venda em que a pessoa participou da passagem vale POINTS_PER_PASSAGE para ela. Retorno por pessoa: { sdrId, name, job, teamId, points, imageUrl } (mesmo nome de campo, points, do ranking de artilheiros).
Inclui todos da coleção SDR (SDR + Suporte + CS).
RF-06 — Semana passada
Placar, artilheiros e ranking de SDR também existem para a semana passada (rotas /last-week). Usam as mesmas funções do período semanal, com a semana anterior (segunda a domingo, America/Sao_Paulo).
RF-05 — Tela do admin
Somente leitura. A planilha é a fonte da verdade: vendas só são criadas, editadas e canceladas pelo envio do Apps Script; correções são feitas na planilha. Não existe criação, edição nem deleção de venda pelo sistema (as rotas POST /sales/create e PATCH /sales/update foram removidas).
O dash do admin mostra todas as vendas, ativas e canceladas (GET /sales/admin).

RF-06b — Acesso às rotas
Rotas do admin exigem login (authMiddleware, header Authorization: Bearer <token>): GET /sales/admin, GET /sales/get/:vendorId. Token ausente, inválido ou expirado → 401 (o front deve chamar /auth/refresh).
Rotas das telas (TVs) são públicas: /analytics/*, GET /sales/get, GET /sales/events (SSE).
Planilha: POST /sales/webhook/sheet, protegido pelo header webhook_secret.
Auth: /auth/register, /auth/login e /auth/refresh são públicas (decisão: cadastro aberto). 7. Pendências e problemas conhecidos no código
Decisões em aberto (⚠️ não implementar sem confirmação)
Valores finais dos pontos (definidos pelo comercial antes da campanha).
Problemas conhecidos
Checklist antes da campanha
Índice único de rdDealId existe no banco (Compass → Indexes).
Índices únicos de vendorName (vendors) e name (sdrs) existem no banco.
Todas as variáveis da seção 3 configuradas no Render.
Seed executado com os nomes dos vendors e SDRs iguais aos textos usados nas colunas "Vendedor" e "Passagens" da planilha (mesma grafia, acentos e maiúsculas).
Apps Script: URL_ENDPOINT apontando para https://<backend no Render>/sales/webhook/sheet, mesmo valor do WEBHOOK_SECRET do backend na propriedade WEBHOOK_SECRET do script, acionadores "Ao editar" (aoEditarPlanilha) e "A cada 10 minutos" (sincronizarTudo) criados.
Coluna "Id da venda" oculta ou protegida na planilha.
Nenhum log imprime o WEBHOOK_SECRET.
