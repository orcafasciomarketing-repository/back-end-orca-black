const SalesRepository = require("../repository/salesRepository");
const VendorRepository = require("../../vendors/repository/vendorsRepository");
const SdrRepository = require("../../sdr/repository/sdrRepository");
const { broadcast } = require("../../../shared/sseManager");
const { translateRdObject } = require("../adapters/rdDealAdapter");

const { STAGE_MAP } = require("../../../config/rdStages");
const { PASSAGE_CUSTOM_FIELD_ID } = require("../../../config/rdCustomFields");

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

// Evento SSE de venda nova: só os campos que o popup usa (o SSE vai para todas as telas)
const buildNewSaleEvent = (sale, vendor, sdr) => ({
  sale: { _id: sale._id, funnelType: sale.funnelType },
  vendor: {
    vendorName: vendor.vendorName,
    job: vendor.job,
    imageUrl: vendor.imageUrl,
  },
  ...(sdr && {
    sdr: { name: sdr.name, job: sdr.job, imageUrl: sdr.imageUrl },
  }),
});

// Evento SSE de venda alterada (cancelada, reativada ou corrigida): as telas só
// buscam os dados de novo, sem popup (o front só abre popup com sale + vendor)
const SALE_UPDATED_EVENT = { type: "sale-updated" };

exports.rdDealEventProcess = async (salesData) => {
  const saleObject = translateRdObject(
    salesData,
    STAGE_MAP,
    PASSAGE_CUSTOM_FIELD_ID,
  );

  // Fora das etapas Blackfriday: só cancela a venda (se existir e estiver ativa)
  if (!saleObject.isBlackFridayStage) {
    const canceledSale = await SalesRepository.cancelByDealId(
      saleObject.rdDealId,
      saleObject.rdUpdatedAt,
    );
    if (canceledSale) broadcast(SALE_UPDATED_EVENT);
    return;
  }

  const vendor = await VendorRepository.findByRdId(saleObject.rdUserId);

  if (!vendor) {
    console.warn(
      `Vendor ${saleObject.rdUserId} não cadastrado no sistema. Venda ${saleObject.rdDealId} não concluída`,
    );
    return;
  }

  saleObject.vendorId = vendor._id;

  // Nome fora do cadastro de SDR: a passagem é descartada e a venda segue sem ela
  let sdr = null;
  if (saleObject.rdPassageName) {
    sdr = await SdrRepository.findByName(saleObject.rdPassageName);
    if (sdr) saleObject.sdrId = sdr._id;
  }

  // Na etapa mas não ganho: a venda (se já existir) recebe os dados e fica cancelada
  if (!saleObject.isBlackFriday) {
    const updatedSale = await SalesRepository.updateCanceledByDealId(saleObject);
    if (updatedSale) broadcast(SALE_UPDATED_EVENT);
    return;
  }

  const savedObject = await SalesRepository.upsertActiveByDealId(saleObject);

  // Venda nova → popup. Atualização ou reativação → só atualiza as telas.
  // Evento antigo ignorado (sale null) → nada muda, nada é enviado.
  if (savedObject.created) {
    broadcast(buildNewSaleEvent(savedObject.sale, vendor, sdr));
  } else if (savedObject.sale) {
    broadcast(SALE_UPDATED_EVENT);
  }
};
