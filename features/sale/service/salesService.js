const SalesRepository = require("../repository/salesRepository");
const VendorRepository = require("../../vendors/repository/vendorsRepository");
const SdrRepository = require("../../sdr/repository/sdrRepository");
const { broadcast } = require("../../../shared/sseManager");
const {
  translateSheetRow,
  findSaleDataErrors,
} = require("../adapters/sheetRowAdapter");

// O Render roda em UTC, mas a semana do ranking segue o horário de São Paulo.
// O Brasil não tem mais horário de verão, então a diferença é sempre de 3 horas.
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

// Semana de segunda 00:00 até domingo 23:59:59.999 no horário de São Paulo.
// weeksAgo = 0 é a semana atual, weeksAgo = 1 é a semana passada.
const getWeekRange = (weeksAgo = 0) => {
  // Atrasa o relógio em 3h: assim os métodos getUTC* devolvem a data de São Paulo
  const today = new Date(Date.now() - SAO_PAULO_OFFSET_MS);
  const day = today.getUTCDay() || 7;
  const start = today.getUTCDate() - (day - 1) - 7 * weeksAgo;

  const startOfWeek = new Date(today);
  startOfWeek.setUTCDate(start);
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const finalOfWeek = new Date(today);
  finalOfWeek.setUTCDate(start + 6);
  finalOfWeek.setUTCHours(23, 59, 59, 999);

  // Adianta de volta as 3h para comparar com as datas do banco, que estão em UTC
  return {
    startOfWeek: new Date(startOfWeek.getTime() + SAO_PAULO_OFFSET_MS),
    finalOfWeek: new Date(finalOfWeek.getTime() + SAO_PAULO_OFFSET_MS),
  };
};

exports.findAll = async (page, limit) => {
  return await SalesRepository.findAll(page, limit);
};

exports.findByVendor = async (vendorId) => {
  return await SalesRepository.findByVendor(vendorId);
};

// Vendas ativas da semana atual, com paginação opcional (rota /sales/get)
exports.findActiveByWeek = async (page, limit) => {
  const { startOfWeek, finalOfWeek } = getWeekRange();

  return await SalesRepository.findByPeriod(
    page,
    limit,
    startOfWeek,
    finalOfWeek,
  );
};

// Soma do value de todas as vendas ativas da campanha (progresso da meta)
exports.sumActiveValue = async () => {
  return await SalesRepository.sumActiveValue();
};

// period: "week" (semana atual), "lastWeek" (semana passada) ou "all" (campanha toda)
exports.findActiveByPeriod = async (period) => {
  if (period === "all") {
    return await SalesRepository.findActiveByRealizedAt();
  }

  const { startOfWeek, finalOfWeek } = getWeekRange(
    period === "lastWeek" ? 1 : 0,
  );

  return await SalesRepository.findActiveByRealizedAt(startOfWeek, finalOfWeek);
};

const toPopupPerson = (sdr) => ({
  name: sdr.name,
  job: sdr.job,
  imageUrl: sdr.imageUrl,
});

// Evento SSE de venda nova: só os campos que o popup usa (o SSE vai para todas as telas)
const buildNewSaleEvent = (sale, vendor, sdrs) => ({
  sale: { _id: sale._id, funnelType: sale.funnelType },
  vendor: {
    vendorName: vendor.vendorName,
    job: vendor.job,
    imageUrl: vendor.imageUrl,
  },
  ...(sdrs.length > 0 && {
    sdrs: sdrs.map(toPopupPerson),
    // Compatibilidade: o popup atual do front lê só "sdr" (uma pessoa).
    // Remover quando o front passar a mostrar a lista "sdrs"
    sdr: toPopupPerson(sdrs[0]),
  }),
});

// Evento SSE de venda alterada (cancelada, reativada ou corrigida): as telas só
// buscam os dados de novo, sem popup (o front só abre popup com sale + vendor)
const SALE_UPDATED_EVENT = { type: "sale-updated" };

// Busca as pessoas da passagem pelo nome. Nomes fora do cadastro são descartados
// e a venda segue com os que existem, na ordem em que vieram da planilha
const findPassageSdrs = async (passageNames) => {
  if (passageNames.length === 0) return [];

  const sdrs = await SdrRepository.findByNames(passageNames);
  return sdrs.sort(
    (a, b) => passageNames.indexOf(a.name) - passageNames.indexOf(b.name),
  );
};

// Processa uma linha da planilha. Devolve o resultado (vai na resposta para o log
// do Apps Script) e os eventos SSE que a linha gerou
const processSheetRow = async (row) => {
  const saleObject = translateSheetRow(row);
  const result = { linha: saleObject.sheetRow, idVenda: saleObject.rdDealId };

  if (!saleObject.rdDealId) {
    return { ...result, status: "erro", mensagem: "Linha sem Id da venda" };
  }
  if (!saleObject.rdUpdatedAt) {
    return { ...result, status: "erro", mensagem: "Atualizado em inválido" };
  }

  const dataErrors = findSaleDataErrors(saleObject);
  const vendor = saleObject.vendorName
    ? await VendorRepository.findByName(saleObject.vendorName)
    : null;
  if (saleObject.vendorName && !vendor) {
    dataErrors.push(`Vendedor "${saleObject.vendorName}" não cadastrado`);
  }

  // Cancelada (ou qualquer status diferente de Concluída)
  if (!saleObject.isConcluded) {
    // Com os dados completos: a venda (se existir) recebe os dados e fica cancelada.
    // Com dados faltando: só cancela. Nos dois casos nunca cria venda
    if (dataErrors.length === 0) {
      saleObject.vendorId = vendor._id;
      saleObject.sdrIds = (await findPassageSdrs(saleObject.rdPassageNames)).map(
        (sdr) => sdr._id,
      );
      const updatedSale = await SalesRepository.updateCanceledByDealId(saleObject);
      return { ...result, status: updatedSale ? "cancelada" : "ignorada", changed: !!updatedSale };
    }

    const canceledSale = await SalesRepository.cancelByDealId(
      saleObject.rdDealId,
      saleObject.rdUpdatedAt,
    );
    return { ...result, status: canceledSale ? "cancelada" : "ignorada", changed: !!canceledSale };
  }

  // Concluída com dado faltando ou vendedor não cadastrado: não grava
  if (dataErrors.length > 0) {
    return { ...result, status: "erro", mensagem: dataErrors.join("; ") };
  }

  saleObject.vendorId = vendor._id;
  const sdrs = await findPassageSdrs(saleObject.rdPassageNames);
  saleObject.sdrIds = sdrs.map((sdr) => sdr._id);

  const savedObject = await SalesRepository.upsertActiveByDealId(saleObject);

  // Venda nova → popup. Atualização ou reativação → só atualiza as telas.
  // Envio antigo ignorado (sale null) → nada muda, nada é enviado
  if (savedObject.created) {
    return {
      ...result,
      status: "criada",
      newSaleEvent: buildNewSaleEvent(savedObject.sale, vendor, sdrs),
    };
  }
  if (savedObject.sale) return { ...result, status: "atualizada", changed: true };
  return { ...result, status: "ignorada", mensagem: "Envio mais antigo que o já salvo" };
};

// rows: lista de linhas enviada pelo Apps Script (um lote)
exports.sheetSalesProcess = async (rows) => {
  const results = [];

  // Uma linha por vez: duas linhas da mesma venda no lote não disputam a gravação
  for (const row of rows) {
    results.push(await processSheetRow(row));
  }

  // Popup para cada venda nova. Para as alterações, um único aviso por lote:
  // a sincronização reenvia a planilha toda e as TVs não precisam buscar os dados N vezes
  for (const result of results) {
    if (result.newSaleEvent) broadcast(result.newSaleEvent);
  }
  if (results.some((result) => result.changed)) broadcast(SALE_UPDATED_EVENT);

  return results.map(({ newSaleEvent, changed, ...result }) => result);
};
