Dashboard Black Friday — Regras de Negócio e Requisitos

Instrução para quem for alterar o código (humano ou IA): Este documento descreve decisões já tomadas. Itens marcados como ⚠️ PENDENTE ainda não foram decididos: não implemente suposições sobre eles, pergunte antes. Quando o documento disser "conferir no código", verifique o nome real no projeto em vez de assumir.

1. Contexto
   Dashboard interno exibido em telas (slides) durante o plantão da Black Friday.
   Vida útil: cerca de 1 mês. Depois da campanha, o sistema é desligado. Não construir funcionalidades pensando em longo prazo (YAGNI).
   As vendas chegam via webhook do RD Station CRM.
   As telas ficam ligadas o tempo todo consultando o backend (isso mantém o serviço ativo no Render).
   Ninguém muda de time durante a campanha.
   Stack
   Camada Tecnologia
   Backend Node.js, Express 5 (erros em funções async chegam sozinhos ao middleware de erros)
   Banco MongoDB com Mongoose
   Tempo real SSE (shared/sseManager, função broadcast)
   Hospedagem Render (roda em UTC)
   Origem dos dados RD Station CRM (webhook)
   Arquitetura em camadas
   Camada Responsabilidade
   Controller Apenas HTTP: valida o secret, chama o service, devolve o status.
   Adapter Única parte que conhece o formato do payload da RD. Função pura: traduz o payload para o objeto do sistema.
   Service Regras de negócio: decide o ramo, busca vendor e passagem, decide o broadcast.
   Repository Única parte que fala com o Mongoose. Traduz detalhes do Mongo (ex.: erro E11000) para resultados neutros.
   Config Leitura de variáveis de ambiente e mapas de configuração.
2. Entidades
   2.1 Sale (model "Sales")
   Campo Tipo Regras
   rdDealId String Obrigatório, único (índice único). Id do deal na RD. Chave da idempotência.
   rdDealName String Opcional. Nome do deal (texto livre, pode repetir).
   vendorId ObjectId → "Vendors" Obrigatório. \_id do vendor no banco do sistema (não é o id da RD).
   value Number Obrigatório. Valor da venda.
   sdrId ObjectId → "SDR" Opcional. Pessoa que fez a passagem (pode ser SDR, Suporte ou CS).
   rdUpdatedAt Date Obrigatório. updated_at do deal (nível document). Usado para ordenar eventos.
   segment String enum ["b2b", "b2g"] Obrigatório. Hoje não é usado em nenhuma tela, mas é mantido.
   funnelType String enum ["farm", "sales"] Obrigatório. sales = Vendas, farm = Renovação.
   realizedAt Date Obrigatório. Data da primeira entrada na etapa Blackfriday. Nunca muda depois. Base dos filtros de período.
   dealStatus String enum ["ativa", "cancelada"] Obrigatório. Status do sistema (não é o status da RD).
   createdAt / updatedAt Date Gerados pelo Mongoose (timestamps: true). Indicam alterações no banco, não na RD.

Convenção: prefixo rd = dado que vem da RD. Campos sem prefixo são do sistema.

2.2 Vendor (model "Vendors")
Vendedor. Pertence a um team (teamId).
Possui o id do usuário na RD com índice único (nome do campo: conferir no código). É o que liga document.user.id do payload ao vendor.
Possui job (informativo; o ranking de artilheiros separa pelo funnelType da venda, não pelo job).
Cadastrados via seed, com os ids reais da RD.
2.3 SDR (model "SDR")
Coleção única para SDR, Suporte e CS, diferenciados pelo campo job.
Essas pessoas só pontuam por passagens.
Pertencem a um team (teamId).
Não possuem id da RD (nem todos têm usuário no RD CRM). São encontrados pelo name, que é único (índice único) e igual às opções do select de passagem na RD.
Cadastrados via seed.
2.4 Team
Time. Possui name e imageUrl (escudo exibido no card).
Vendors e SDRs apontam para o team. A venda não guarda o team: ele é obtido pelo vendor (ou pela pessoa da passagem).
2.5 O que NÃO é entidade
Deal da RD: conceito externo. Entra pelo adapter e vira uma Sale.
Mapa de etapas e mapa de pontos: configuração.
Meta: configuração (variável de ambiente), pois é única e não muda. 3. Configuração (variáveis de ambiente)

Devem existir no .env local e nas variáveis de ambiente do Render.

Variável Uso
WEBHOOK_SECRET Valor esperado no header webhook_secret do webhook. Nunca logar.
B2B_FUNIL_BLACKFRIDAY_SALES Id da etapa Blackfriday do funil B2B Vendas.
B2B_FUNIL_BLACKFRIDAY_FARM Id da etapa Blackfriday do funil B2B Farmer.
B2G_FUNIL_BLACKFRIDAY_SALES Id da etapa Blackfriday do funil B2G Vendas.
B2G_FUNIL_BLACKFRIDAY_FARM Id da etapa Blackfriday do funil B2G Farmer.
POINTS_PER_SALE Pontos por venda do tipo sales.
POINTS_PER_FARM Pontos por venda do tipo farm.
POINTS_PER_PASSAGE Pontos por passagem.
RD_PASSAGE_CUSTOM_FIELD_ID Id do custom field (select) da passagem (custom_field.id dentro de document.deal_custom_fields).
BLACK_FRIDAY_GOAL Meta da Black (valor em reais). Lida em config/goal.js com Number(process.env.BLACK_FRIDAY_GOAL ?? 0).

Importante: as quatro variáveis de etapa guardam ids de etapa (document.deal_stage.id), não de funil (document.deal_pipeline.id).

3.1 config/rdStages.js
Exporta { STAGE_MAP }.
STAGE_MAP é um objeto: chave = id da etapa (valor da variável), valor = { segment, funnelType }.
Variável de etapa vazia ou ausente fica fora do mapa (evita chave "undefined"/"" que faria um deal sem etapa virar Blackfriday) e gera um console.warn na inicialização com o nome das variáveis faltando.
config/rdCustomFields.js exporta { PASSAGE_CUSTOM_FIELD_ID }.
3.2 config/points.js
Exporta { pointsMap }.
pointsMap é um Map com as chaves "sales", "farm" e "passage".
Valores convertidos com Number(process.env.X ?? 0). Padrão 0 se a variável não existir.
Os valores finais só são definidos pelo comercial pouco antes da campanha. O sistema deve funcionar com qualquer valor configurado. Não fixar valores no código. 4. Regras de negócio
4.1 O que é uma venda
RN-01: Só é venda Blackfriday o deal cuja etapa atual (document.deal_stage.id) está no STAGE_MAP (uma das quatro etapas Blackfriday) E cujo status na RD (document.status) é "won". As duas condições juntas.
RN-02: O comercial sempre marca o deal como ganho na RD (acordado com o comercial). Um deal na etapa Blackfriday sem status "won" (ex.: arrastado por engano) não é venda e não gera popup.
RN-03: A RD envia eventos de todos os funis e etapas. Eventos de etapas fora do mapa não criam vendas.
4.2 Ciclo de vida da venda
RN-04 (criação): deal fica numa etapa Blackfriday com status won pela primeira vez → venda criada com status ativa.
RN-05 (correção): deal continua na etapa e algum dado muda (ex.: valor) → venda atualizada.
RN-06 (cancelamento): deal sai da etapa Blackfriday para qualquer outra etapa, ou deixa de estar won (perdido, reaberto, pausado) → venda marcada como cancelada. Nunca apagar (soft delete).
RN-06b (edição de venda cancelada): enquanto o deal estiver numa etapa Blackfriday, qualquer edição (valor, nome, dono, passagem, troca de funil) é refletida na venda, mesmo cancelada; o status continua definido pelo won. O admin tem um dash com essas informações. Fora da etapa, a venda só é cancelada (os dados não mudam). Deal que nunca foi ganho não vira venda (nada é criado), para o realizedAt continuar sendo a data em que foi ganho.
RN-07 (reativação): deal cancelado volta a estar numa etapa Blackfriday com status won → venda volta a ativa.
RN-08 (troca de funil): deal vai da etapa Blackfriday de um funil para a de outro → segment e funnelType são atualizados.
RN-09 (data da venda): realizedAt é a data do primeiro evento em que o deal estava na etapa e won. Correções e reativações não alteram essa data.
RN-10: Vendas cancelada não contam em nenhuma tela.
4.3 Idempotência e ordem dos eventos
RN-11: A RD entrega eventos pelo menos uma vez e reenvia em caso de timeout ou resposta não-2xx. O mesmo evento pode chegar várias vezes, inclusive ao mesmo tempo.
RN-12: Reenvios não podem duplicar vendas nem gerar popups repetidos. Garantia: índice único em rdDealId.
RN-13: Qualquer alteração na negociação precisa refletir no banco. A RD NÃO muda o updated_at quando só um custom field é editado (ex.: passagem), então um evento é aplicado quando o seu updated_at é mais novo OU IGUAL ($lte) ao rdUpdatedAt salvo. Só eventos estritamente mais antigos (fora de ordem) são ignorados. Limitação aceita: duas edições com o mesmo updated_at que cheguem fora de ordem ficam com a que chegou por último.
RN-14: A ordenação usa document.updated_at (nível do deal, com milissegundos). Não usar deal_stage.updated_at (é a data de edição da etapa no funil, igual para todos os deals). Não usar event_timestamp (só tem precisão de segundos).
RN-15: Datas sempre salvas como Date, nunca como string.
4.4 Vendedor
RN-16: O vendedor da venda é o dono do deal na RD (document.user.id), encontrado no banco pelo id da RD.
RN-17: Se o vendor não for encontrado, a venda não é salva e um console.warn registra o rdUserId e o rdDealId.
4.5 Passagem
RN-18: Uma venda pode ter zero ou uma passagem. O campo é opcional.
RN-19: A passagem vem num custom field do tipo select (type "option") em document.deal_custom_fields: { value: "Nome da pessoa", custom_field: { id, label, opts, type } }. O campo é encontrado pelo custom_field.id (RD_PASSAGE_CUSTOM_FIELD_ID), nunca pela posição na lista nem pelo label. Campo vazio vem com value null; o campo também pode nem vir na lista.
RN-20: A passagem só existe junto com a venda. Ela fica dentro do documento da Sale (sdrId), não em coleção separada. Se a venda for cancelada, a passagem deixa de contar.
RN-21: A pessoa da passagem é buscada na coleção SDR pelo name (comparação exata com o valor do select). Se o nome não estiver cadastrado, a passagem é descartada (sem log) e a venda é salva sem sdrId.
RN-22: sem passagem, a venda não tem a propriedade sdrId ($unset). Se a passagem for removida do deal na RD, o próximo evento remove o sdrId; se for trocada, o sdrId é atualizado.
4.6 Pontuação
RN-23: Venda sales vale POINTS_PER_SALE pontos.
RN-24: Venda farm (Renovação) vale POINTS_PER_FARM pontos.
RN-25: Cada passagem vale POINTS_PER_PASSAGE pontos.
RN-26: Pontos não são gravados na venda. São calculados na leitura, a partir do pointsMap. Assim, se os valores mudarem, valem para todas as vendas imediatamente.
RN-27: Pontos de venda/renovação vão para o time do vendedor.
RN-28: Pontos de passagem vão para o time de quem fez a passagem (pode ser diferente do time do vendedor).
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
RN-36: O broadcast SSE serve apenas para o popup de venda nova.
RN-37: Dispara somente quando a venda é criada (created: true). Correções, cancelamentos, reativações e reenvios não disparam popup.
RN-38: As estatísticas das telas não vêm do SSE: vêm de consultas ao backend.
RN-39 (recomendação): enviar no broadcast só os campos que o popup usa (o SSE vai para todas as telas conectadas). 5. Fluxo do webhook (implementado)
5.1 Controller
Lê o header webhook_secret e compara com WEBHOOK_SECRET. Diferente → 401 com mensagem genérica.
await no service.
Responde 200, inclusive para eventos ignorados. A RD não lê o corpo da resposta.
Erros sobem para o middleware de erros (Express 5) → resposta não-2xx → a RD reenvia (seguro por causa da idempotência).
5.2 Adapter (translateRdObject(rawObject, stageMap))

Função pura. Recebe o payload e o mapa de etapas como parâmetro. Devolve sempre o mesmo formato:

Campo de saída Origem no payload
rdDealId document.id
rdDealName document.name
value document.amount_total (confirmado: é o valor da venda)
rdUpdatedAt new Date(document.updated_at)
rdUserId document.user.id
isBlackFridayStage true se document.deal_stage.id está no mapa (qualquer status)
isBlackFriday true se document.deal_stage.id está no mapa E document.status === "won"
rdPassageName value do custom field de id RD_PASSAGE_CUSTOM_FIELD_ID (null se vazio ou ausente)
segment, funnelType espalhados a partir do mapa (ausentes quando não é Blackfriday)
5.3 Service (rdDealEventProcess)
dados = adapter(payload, STAGE_MAP)

se não está numa etapa Blackfriday (isBlackFridayStage false):
cancelByDealId(rdDealId, rdUpdatedAt)
fim (sem broadcast)

vendor = buscar vendor pelo id da RD
se não existe:
console.warn com rdUserId e rdDealId
fim

dados.vendorId = vendor.\_id
se dados.rdPassageName:
sdr = buscar SDR pelo name
se existe: dados.sdrId = sdr._id (senão a passagem é descartada)

se não é won (isBlackFriday false):
updateCanceledByDealId(dados)
fim (sem broadcast)

{ sale, created } = upsertActiveByDealId(dados)
se created: broadcast(venda + dados do vendor para o popup)
5.4 Repository

upsertActiveByDealId(sale)

Filtro: rdDealId igual e rdUpdatedAt $lte o do evento.
$set: rdDealName, value, vendorId, segment, funnelType, rdUpdatedAt, dealStatus: "ativa" e sdrId (quando há passagem).
$unset: sdrId (quando não há passagem).
$setOnInsert: realizedAt = rdUpdatedAt do evento.
Opções: upsert: true, new: true, runValidators: true, includeResultMetadata: true.
Retorno: { sale: result.value, created: !result.lastErrorObject.updatedExisting }.
Erro 11000 (evento mais antigo que o salvo: o filtro não acha a venda e o upsert tenta criar outra com o mesmo rdDealId) → retorna { sale: null, created: false }. Qualquer outro erro é relançado.

updateCanceledByDealId(sale)

Deal na etapa mas não won. Sem upsert (nunca cria documento).
Filtro: rdDealId igual e rdUpdatedAt $lte o do evento (qualquer dealStatus).
$set/$unset: os mesmos dados do upsertActiveByDealId, com dealStatus: "cancelada".

cancelByDealId(rdDealId, rdUpdatedAt)

Deal fora da etapa. Sem upsert (nunca cria documento).
Filtro: rdDealId igual, rdUpdatedAt $lte o do evento, dealStatus: "ativa".
$set: dealStatus: "cancelada", rdUpdatedAt.
Retorna a venda cancelada ou null. Sem try/catch (não existe E11000 sem upsert).
5.5 Tabela de comportamento esperado (cenários de teste)
Evento Resultado no banco Popup
Deal na etapa Blackfriday e marcado como ganho venda criada, ativa sim
Deal na etapa Blackfriday mas ainda não ganho nada salvo não
Mesmo evento reenviado dados reaplicados, sem duplicar não
Só um custom field editado (updated_at igual, ex.: passagem) dado atualizado não
Valor corrigido na RD value atualizado, realizedAt igual não
Deal sai da etapa cancelada não
Deal perdido, reaberto ou pausado (ainda na etapa) cancelada, dados atualizados não
Venda cancelada editada ainda na etapa (valor, passagem, funil) dados atualizados, continua cancelada não
Deal fora da etapa editado continua cancelada, dados não mudam não
Deal nunca ganho editado na etapa nada salvo não
Evento antigo chega depois do cancelamento nada muda não
Deal volta para a etapa ativa, realizedAt igual não
Deal vai para a etapa Blackfriday de outro funil segment/funnelType atualizados não
Dono do deal não cadastrado como vendor nada salvo, console.warn não 6. Requisitos funcionais (telas)
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
Top 3 por pontos de passagem: cada passagem vale POINTS_PER_PASSAGE. Retorno por pessoa: { sdrId, name, job, teamId, points, imageUrl } (mesmo nome de campo, points, do ranking de artilheiros).
Inclui todos da coleção SDR (SDR + Suporte + CS).
RF-06 — Semana passada
Placar, artilheiros e ranking de SDR também existem para a semana passada (rotas /last-week). Usam as mesmas funções do período semanal, com a semana anterior (segunda a domingo, America/Sao_Paulo).
RF-05 — Tela do admin
Somente leitura. A RD é a fonte da verdade: vendas só são criadas, editadas e canceladas pelo webhook; correções são feitas na RD. Não existe criação, edição nem deleção de venda pelo sistema (as rotas POST /sales/create e PATCH /sales/update foram removidas).
O dash do admin mostra todas as vendas, ativas e canceladas (GET /sales/admin).

RF-06b — Acesso às rotas
Rotas do admin exigem login (authMiddleware, header Authorization: Bearer <token>): GET /sales/admin, GET /sales/get/:vendorId. Token ausente, inválido ou expirado → 401 (o front deve chamar /auth/refresh).
Rotas das telas (TVs) são públicas: /analytics/*, GET /sales/get, GET /sales/events (SSE).
Webhook: POST /sales/webhook/deal, protegido pelo header webhook_secret.
Auth: /auth/register, /auth/login e /auth/refresh são públicas (decisão: cadastro aberto). 7. Pendências e problemas conhecidos no código
Decisões em aberto (⚠️ não implementar sem confirmação)
Valores finais dos pontos (definidos pelo comercial antes da campanha).
Problemas conhecidos
Service de sales: o broadcast está comentado de propósito até o front do popup ficar pronto; deve estar ativo na campanha.
Checklist antes da campanha
Índice único de rdDealId existe no banco (Compass → Indexes).
Todas as variáveis da seção 3 configuradas no Render, com ids de etapa.
Seed executado com os ids reais da RD de todos os vendors e com os nomes dos SDRs iguais às opções do select de passagem.
RD_PASSAGE_CUSTOM_FIELD_ID configurado com o id real do custom field.
Webhook ativo antes de o comercial começar a mover deals para as etapas Blackfriday (senão o realizedAt fica errado).
Nenhum log imprime o WEBHOOK_SECRET.
B2B_FUNIL_BLACKFRIDAY_FARM preenchido (aguardando o comercial definir a etapa).
