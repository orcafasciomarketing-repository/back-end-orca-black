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
   vendorId ObjectId → "Vendors" Opcional no model, obrigatório na planilha. \_id do vendor encontrado pelo nome (coluna "Vendedor"). Só a importação (4.11) grava venda sem vendedor.
   value Number Obrigatório. Coluna "Valor da venda".
   sdrIds [ObjectId] → "SDR" Lista (padrão vazia). Pessoas da coluna "Passagens" (SDR, Suporte ou CS). Lista vazia = sem passagem.
   rdUpdatedAt Date Obrigatório. Coluna "Atualizado em" (momento do envio, colocado pelo Apps Script). Usado para ordenar os envios.
   segment String enum ["b2b", "b2g"] Obrigatório. Coluna "Setor". Hoje não é usado em nenhuma tela, mas é mantido.
   funnelType String enum ["farm", "sales"] Obrigatório. Coluna "Classificação": "Renovação" = farm; vazia (venda nova) = sales.
   realizedAt Date Obrigatório. Coluna "Data da venda". Pode ser corrigida na planilha. Base dos filtros de período.
   dealStatus String enum ["ativa", "cancelada"] Obrigatório. Coluna "Status": "Concluída" = ativa; "Cancelada" (ou qualquer outro) = cancelada.
   source String enum ["planilha", "importacao"] Padrão "planilha". De onde a venda veio. Vendas antigas, sem o campo, são da planilha.
   importId String Só nas vendas importadas. Lote da importação (as vendas novas entram antes de as antigas saírem).
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
POINTS_B2G_SALE Pontos por venda B2G do tipo sales (definido: 3).
POINTS_B2G_FARM Pontos por venda B2G do tipo farm (definido: 2).
POINTS_B2B_SALE Pontos por venda B2B do tipo sales (definido: 2).
POINTS_B2B_FARM Pontos por venda B2B do tipo farm (definido: 1).
POINTS_B2G_SDR Pontos por passagem de pessoa com cargo "B2G SDR" (definido: 2).
POINTS_B2B_SDR Pontos por passagem de pessoa com cargo "B2B SDR" (definido: 1; só o Victor Batilochi).
POINTS_CS Pontos por passagem de pessoa com cargo "CS" (definido: 1).
POINTS_SUPORTE Pontos por passagem de pessoa com cargo "Suporte" (definido: 2).
BLACK_FRIDAY_GOAL Meta da Black (valor em reais). Lida em config/goal.js com Number(process.env.BLACK_FRIDAY_GOAL ?? 0). Vale quando as metas de setor não estão configuradas.
BLACK_FRIDAY_GOAL_B2B Meta do B2B (definido: 2.000.000).
MASTER_EMAIL E-mail do master admin (o único que importa vendas, vê os erros e troca perfil/senha ou exclui usuários). Sem ela, todo admin vale como master.
BLACK_FRIDAY_GOAL_B2G Meta do B2G (definido: 1.000.000). Com as duas de setor configuradas, a meta total é a soma delas (o teste de config confere que bate com a BLACK_FRIDAY_GOAL).

As variáveis da RD (B2B_FUNIL_*, B2G_FUNIL_*, RD_PASSAGE_CUSTOM_FIELD_ID) não são mais usadas e podem ser apagadas.

3.1 config/points.js
Exporta { getSalePoints, getPassagePoints }.
getSalePoints(sale): pontos pela chave "segment-funnelType" (b2g-sales, b2g-farm, b2b-sales, b2b-farm).
getPassagePoints(sdr): pontos pelo cargo (job) da pessoa: "b2g sdr", "b2b sdr", "cs", "suporte" (comparação ignora acento, maiúscula e espaço sobrando).
Valores convertidos com Number(process.env.X ?? 0). Padrão 0 se a variável não existir. Combinação ou cargo fora da tabela vale 0.
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
RN-23: Pontos da venda dependem do Setor da venda e da Classificação: B2G venda = POINTS_B2G_SALE, B2G farm = POINTS_B2G_FARM, B2B venda = POINTS_B2B_SALE, B2B farm = POINTS_B2B_FARM.
RN-24: Pontos da passagem dependem do cargo (job) da pessoa cadastrada, não do Setor da venda: B2G SDR = POINTS_B2G_SDR, B2B SDR = POINTS_B2B_SDR (só o Victor Batilochi), CS = POINTS_CS, Suporte = POINTS_SUPORTE.
RN-25: Cada pessoa da passagem soma os pontos do próprio cargo (venda com 2 pessoas = soma dos dois cargos).
RN-26: Pontos não são gravados na venda. São calculados na leitura, a partir de config/points.js. Assim, se os valores mudarem, valem para todas as vendas imediatamente.
RN-27: Pontos de venda/renovação vão para o time do vendedor. Venda sem vendedor (importada) não dá pontos a nenhum time nem entra no ranking de artilheiros, mas conta na meta.
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
RN-40: O front envia os erros das TVs para POST /logs (pública, 60 por minuto por IP) e o admin lê em GET /logs (privada, 200 mais recentes). Logs são apagados 30 dias depois de recebidos (índice TTL em createdAt). Contrato no ERROS_E_LOGS.md do front.
4.11 Importação de vendas pelo admin
RN-41: O admin (logado) importa um CSV com vendas que não estão na planilha principal (POST /sales/import). Primeiro vê a prévia (POST /sales/import/preview), que nunca grava.
RN-42: O arquivo é a lista completa das vendas importadas: cada importação substitui todas as importadas antes (source "importacao"). Corrigir, adicionar ou remover = mudar o arquivo e importar de novo. Importar o mesmo arquivo duas vezes não duplica.
RN-43: A importação nunca mexe nas vendas da planilha, e a sincronização da planilha nunca mexe nas importadas (o rdDealId das importadas é "importacao:<uuid>").
RN-44: Mesmas regras da planilha (sheetRowAdapter), lendo as colunas pelo nome: Setor, Valor da venda e Data da venda obrigatórias; Id da empresa, Vendedor, Passagens e Classificação opcionais. Valor aceita formato brasileiro ("R$ 1.234,56"); data aceita dd/mm/aaaa (horário de São Paulo). CSV com "," (Sheets) ou ";" (Excel).
RN-45: Vendedor é opcional. Com vendedor, a venda pontua como uma venda da planilha (time, artilheiros e passagens). Sem vendedor, só conta na meta. Sem vendedor e com passagem → erro.
RN-46: Qualquer linha com erro (vendedor não cadastrado, setor, valor ou data inválidos, passagem sem vendedor) → nada é gravado e a importação anterior continua valendo. Passagem com nome não cadastrado é descartada com aviso (não impede).
RN-47: Com coluna Status no arquivo, só "Concluída" entra (as outras linhas são listadas como ignoradas). Sem a coluna, todas as linhas entram.
RN-48: A prévia compara a importação atual com o arquivo (quantidade e valor) e avisa vendas que parecem já existir na planilha (mesmo "Id da venda", ou mesma empresa, valor e dia), que contariam duas vezes.
RN-49: Importação não abre popup (reenvia todas as vendas toda vez). Ao gravar, envia um único { type: "sale-updated" }.
4.12 Perfis de acesso e meta por setor
RN-50: Perfis fixos: master (tudo), admin (todos os setores; vê e cadastra usuários), b2b e b2g (só o próprio setor, no Dashboard e nos Gráficos). Usuário sem role (criado antes dos perfis) é admin. O master não é gravado: é quem tem o e-mail do MASTER_EMAIL; sem a variável, todo admin vale como master.
RN-51: O filtro de setor é no servidor: GET /sales/admin e GET /sales/get/:vendorId devolvem só o setor de b2b/b2g. O front também trava o filtro de setor no setor do usuário.
RN-52: Importação e logs (tela de Erros) são só do master; trocar perfil/senha e excluir usuários também. Admin só vê e cadastra usuários. Fora disso → 403, e o front esconde as telas e redireciona para o dashboard.
RN-53: O perfil é lido do banco a cada requisição (não do token): trocar o perfil ou excluir o usuário vale na hora.
RN-54: Não existe cadastro aberto: /auth/register foi removida. Master e admin cadastram na tela Usuários (rotas /users); só o master troca perfil/senha e exclui. Ninguém muda o próprio perfil nem se exclui; ninguém vira master pela tela, e o admin não cadastra o e-mail do MASTER_EMAIL.
RN-55: Meta por setor: B2B 2 milhões, B2G 1 milhão (GET /analytics/goal → segments). Com setor selecionado, o admin compara com a meta do setor. As TVs continuam públicas e com a meta total.
4.13 Forecast (GET /analytics/forecast, modelo do forecast_automatico_crm.pdf)
RN-56: Campanha de 03/11 a 01/12/2026. Dias produtivos: segunda a sábado, sem feriados (config/campaign.js). Dias sem venda contam como R$ 0 nas médias e no desvio.
RN-57: Ritmo ponderado = 50% média dos últimos 7 dias produtivos + 30% dos últimos 30 + 20% da campanha. Cenários = vendido + ritmo × 0,8 / 1 / 1,2 × dias produtivos restantes.
RN-58: Também devolve ritmo necessário, cobertura do ritmo (não é probabilidade), gap realista e probabilidade estatística (normal, desvio dos últimos 30 dias produtivos), além da semana atual (só cenários, sem meta).
RN-57a (forecast por setor): cada setor tem o seu modelo de forecast (config/forecastModels.js). O B2B usa as fórmulas do PDF (RN-57); o B2G ainda não mandou as dele e usa o modelo do B2B até lá — quando chegarem, troca-se só o modelo do B2G. O forecast de todos os setores juntos é a soma dos forecasts de cada setor, cada um com o seu modelo (ritmo, cenários e trajetória somados; ritmo necessário, cobertura, gap e probabilidade recalculados com a soma). Vale também para o forecast das metas mensais (RN-72).
RN-59: Rota privada: b2b/b2g sempre recebem o próprio setor e a meta do setor. O admin usa só este forecast para previsão (o antigo card "Previsão de fechamento", com média simples, saiu do front); ele aparece no widget "Forecast" (Gráficos) e na tela Previsão.
RN-60 (meta semanal): automática, em weekGoal do forecast (campo à parte; week não mudou). Meta da semana = (meta − vendido antes da segunda) ÷ dias produtivos da segunda até 01/12 × dias produtivos da semana. Fica fixa durante a semana; null antes ou depois da campanha e sem meta.
RN-61 (ranking por setor): /ranking, /sdr-ranking e as versões last-week aceitam ?segment=b2b|b2g e contam só as vendas do setor. Sem o parâmetro (ou inválido), nada muda: as TVs continuam iguais.
RN-62 (histórico de pontos): GET /analytics/points-history (privada; b2b/b2g só o próprio setor) devolve os pontos de cada time por dia (venda, renovação e passagem), da primeira venda até hoje, inclusive dias sem venda.
RN-63 (pontos por pessoa): GET /analytics/people-points (privada; b2b/b2g só o próprio setor) devolve todos os vendedores e pessoas de passagem com o time e os pontos de venda, renovação e passagem (quem não pontuou vem com 0). Aceita period (all/week/lastWeek) e from/to (dias em São Paulo). Usa a mesma tabela de pontos do placar: a soma das pessoas de um time é o total do time.
RN-64 (área do colaborador): perfis vendor e sdr, com a conta ligada a um vendedor (vendorId) ou a uma pessoa de passagem (sdrId). Eles só acessam /me: GET /me (perfil e time), /me/sales (vendedor: as próprias vendas; passagem: as vendas em que participou) /me/team (posição do time entre todos e os pontos de cada colega do time, sem valores de venda) e /me/prizes (os próprios pontos acumulados e os prêmios já retirados, com o mesmo cálculo de RN-66 e RN-67). Todas as rotas do admin respondem 403 para eles; os perfis antigos não mudam. O comando node seed.js --contas (rodado à mão, uma vez; não roda no deploy, porque o bcrypt de cada senha atrasava a subida do servidor) cria a conta de cada vendedor e pessoa de passagem que ainda não tem: e-mail nome.sobrenome@orcafascio.com e senha primeiro nome com inicial maiúscula + 123, sem acento (ex.: vinicius.pereira@orcafascio.com / Vinicius123). Nunca troca senha ou perfil de conta que já existe.
RN-65 (sair e trocar a própria senha): POST /auth/logout invalida o refresh token do cookie e apaga o cookie (pública, funciona com o access token vencido; sempre 200). POST /auth/change-password (qualquer perfil logado) pede a senha atual, grava a nova (mínimo 6, com confirmação), derruba todas as sessões da pessoa e abre uma sessão nova para quem trocou. Só troca a senha do próprio usuário (vem do token).
RN-66 (prêmios): a cada PRIZE_POINTS_STEP pontos (padrão 10) a pessoa ganha direito a 1 prêmio. Vale para vendedores e pessoas de passagem (SDR, CS e Suporte), com os mesmos pontos de "Pontos por pessoa" (RN-63), de todos os setores. Os pontos são cumulativos e contam todos até agora, inclusive os da semana em andamento (os prêmios são entregues na segunda e valem o que a pessoa já fez): direitos = pontos acumulados ÷ 10, arredondado para baixo (a sobra passa para a semana seguinte). Os pontos da semana em andamento também aparecem à parte, só como informação.
RN-67 (retiradas): a retirada não é automática: o master registra cada uma (pessoa, quantidade e dia, sem dizer qual prêmio; os prêmios costumam ser entregues na segunda). Saldo = direitos − retirados (não é gravado, é calculado). Venda cancelada depois da retirada: o prêmio retirado continua contando, o saldo fica negativo ("devendo X pontos") e a venda nova só zera o saldo, sem dar outro prêmio. Retirada acima do saldo só é registrada com confirmação (confirmOverBalance; sem ela, 409). Lançamento errado: o master exclui e o saldo se recalcula.
RN-68 (quem vê os prêmios): GET /prizes e /prizes/withdrawals: master e admin veem todos; b2b/b2g só as pessoas com cargo do próprio setor ("B2B ..." / "B2G ..."), então CS e Suporte (sem setor no cargo) aparecem só para master e admin. Registrar e excluir: só o master.
RN-69 (metas mensais por setor): todo mês, para cada setor (b2b e b2g), o gestor cadastra em R$ a Meta de Farmer (renovação) e a de Venda (a Meta do setor é a soma) e o % da Super meta sobre a Meta (o único percentual, > 100%): a Super de cada parte = Meta da parte × %. No mês em que a campanha começa (config/campaign.js) entra também a Meta black: a do setor vem do .env (BLACK_FRIDAY_GOAL_B2B/B2G, a mesma das TVs, ex.: B2B 2 mi e B2G 1 mi = 3 mi) e não é editada; o gestor só diz quanto dela é de Farmer, e Venda fica com o resto (em cada parte com Meta, Black > Super). Nos outros meses só há Meta e Super. Cada mês é um documento separado (coleção MonthlyGoals): mudar um mês não mexe nos outros, e um mês novo vem preenchido com o último salvo para o gestor só ajustar. Não muda a meta das TVs (BLACK_FRIDAY_GOAL*).
RN-70 (senioridade e meta da pessoa): o gestor define os níveis com um peso cada (ex.: Júnior 1, Pleno 1,5, Sênior 2) e o nível de cada vendedor do setor (pelo cargo "B2B ..." / "B2G ..."). A Meta de renovação é dividida pelos pesos entre os Farmers do setor e a de vendas entre os outros cargos. A Super e a Black de cada parte começam divididas entre as pessoas da parte na proporção da Meta de cada uma (então seguem a senioridade e os ajustes à mão). O gestor pode ajustar à mão a Meta, a Super e a Black (esta só no mês da campanha) de cada pessoa; o que sobra da parte vai para quem não foi ajustado. Só salva quando a soma de cada faixa em cada parte fecha no centavo, e cada pessoa tem Super ≥ Meta e Black ≥ Super. Passagem (SDR, CS, Suporte) não tem meta. Vendedor pode ficar sem meta no mês.
RN-71 (semanas): a semana vai de segunda a domingo e pertence ao mês em que começa; o mês da meta são essas semanas (a última pode terminar no mês seguinte, e os dias antes da primeira segunda contam no mês anterior). A meta mensal de cada vendedor é dividida igualmente pelas semanas (a tela sugere, o gestor pode ajustar) e só salva quando a soma das semanas = a mensal. A Super e a Black da pessoa vão para as semanas na proporção da Meta semanal.
RN-72 (o que conta e as faixas): conta o valor das vendas ativas do vendedor do tipo do cargo (Farmer só renovação; os outros só venda nova), pelo dia de São Paulo. Faixas na semana, no mês, no time (soma das pessoas) e no setor: Meta, Super meta e, no mês da campanha, Meta black. A faixa atual é a primeira ainda não batida; bateu a última, o que passar é excedente. O ritmo (no ritmo/atrasado, quanto precisa por dia, projeção) é sempre em relação à Meta. Além disso, o mês tem um forecast no mesmo modelo do forecast da campanha (ritmo ponderado dos últimos 7 e 30 dias produtivos e do mês, cenários pessimista/realista/otimista) para o total, cada setor e cada vendedor, com quanto precisa por dia produtivo e a chance de bater cada faixa (Meta, Super e Black). Há também um histórico mês a mês (/goals/:mes/history) com o realizado e as faixas de cada mês; mês sem meta mostra só o realizado, contando os vendedores pelo cargo de hoje.
RN-73 (quem vê as metas): fase de teste com o gestor: só master e admin veem e cadastram (/goals); b2b, b2g e colaboradores recebem 403. A visão do vendedor (só a própria meta, um widget por faixa) fica para depois.
5. Fluxo da planilha (implementado)
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
Tabelas de consulta: id do vendor → id do time; id da pessoa da passagem → pessoa (time e cargo).
Pontos somados com getSalePoints/getPassagePoints (nunca ++ fixo).
A passagem é processada independentemente do vendor (fora do if do time do vendor).
Os nomes das categorias de venda no objeto do time (sales, farm) são iguais aos valores de funnelType.
RF-03 — Ranking de artilheiros (Vendas e Farmer, semanal e geral)
Top 3 por pontos.
Separação pelo funnelType da venda: o ranking de Vendas soma só vendas sales e o de Farmer só vendas farm. Um vendedor com os dois tipos pode aparecer nos dois rankings.
Sem critério de desempate (empate fica na ordem que vier do banco).
Query string: vendorDepartment=farm → farm; qualquer outro valor → sales.
RF-04 — Ranking de SDR / passagens
Top 3 por pontos de passagem: cada venda em que a pessoa participou da passagem vale para ela os pontos do cargo dela. Retorno por pessoa: { sdrId, name, job, teamId, points, imageUrl } (mesmo nome de campo, points, do ranking de artilheiros).
Inclui todos da coleção SDR (SDR + Suporte + CS).
RF-06 — Semana passada
Placar, artilheiros e ranking de SDR também existem para a semana passada (rotas /last-week). Usam as mesmas funções do período semanal, com a semana anterior (segunda a domingo, America/Sao_Paulo).
RF-05 — Tela do admin
Somente leitura para as vendas da planilha. A planilha é a fonte da verdade delas: só são criadas, editadas e canceladas pelo envio do Apps Script; correções são feitas na planilha (as rotas POST /sales/create e PATCH /sales/update foram removidas). A única escrita do admin é a importação de vendas por CSV (4.11), que só mexe nas vendas importadas.
O dash do admin mostra todas as vendas, ativas e canceladas (GET /sales/admin).

RF-06b — Acesso às rotas
Rotas do admin exigem login (authMiddleware, header Authorization: Bearer <token>): GET /sales/admin, GET /sales/get/:vendorId, POST /sales/import/preview, POST /sales/import, GET /logs e /users. Token ausente, inválido ou expirado, ou usuário excluído → 401 (o front deve chamar /auth/refresh). Importação e logs são só do master; /users: master e admin veem e cadastram, só o master edita e exclui (ver 4.12).
Rotas das telas (TVs) são públicas: /analytics/*, GET /sales/get, GET /sales/events (SSE).
Planilha: POST /sales/webhook/sheet, protegido pelo header webhook_secret.
Auth: /auth/login e /auth/refresh são públicas. /auth/register foi removida: cadastro só pelo admin (POST /users). 7. Pendências e problemas conhecidos no código
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
