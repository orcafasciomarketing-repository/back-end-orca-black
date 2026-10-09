const SalesRepository = require("../repository/salesRepository");
const VendorRepository = require("../../vendors/repository/vendorsRepository");
const { broadcast } = require("../../../shared/sseManager");

const STAGE_MAP = {
  [process.env.B2B_FUNIL_BLACKFRIDAY_SALES]: { segment: "b2b", funnelType: "sales" },
  [process.env.B2B_FUNIL_BLACKFRIDAY_FARM]:  { segment: "b2b", funnelType: "farm" },
  [process.env.B2G_FUNIL_BLACKFRIDAY_SALES]: { segment: "b2g", funnelType: "sales" },
  [process.env.B2G_FUNIL_BLACKFRIDAY_FARM]:  { segment: "b2g", funnelType: "farm" },
};

exports.create = async (salesData) => {
  const sale = await SalesRepository.create(salesData);

  broadcast(sale);
  return sale;
};

exports.findAll = async (page, limit) => {
  return await SalesRepository.findAll(page, limit);
};

exports.findByVendor = async(vendorId) =>{
  return await SalesRepository.findByVendor(vendorId)
}

exports.findByPeriod = async (page, limit) => {
  const today = new Date();
  const day = today.getDay() || 7;
  const start = today.getDate() - day + 1;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(start);
  startOfWeek.setHours(0, 0, 0, 0);

  const finalOfWeek = new Date(today);
  finalOfWeek.setDate(start + 4);
  finalOfWeek.setHours(23, 59, 59, 999);

  return await SalesRepository.findByPeriod(page, limit, startOfWeek, finalOfWeek);
};

exports.updateById = async (id, data) => {
  return await SalesRepository.updateById(id, data);
};

exports.findByExactWeek = async(page, limit) =>{
  const today = new Date();
  const day = today.getDay() || 7;
  const start = today.getDate() - (day - 1) - 7;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(start);
  startOfWeek.setHours(0, 0, 0, 0);

  const finalOfWeek = new Date(today);
  finalOfWeek.setDate(start + 6);
  finalOfWeek.setHours(23, 59, 59, 999);

  return await SalesRepository.findByPeriod(page, limit, startOfWeek, finalOfWeek);
}

exports.rdDealEventProcess = async(salesData) =>{
  const saleObject = {
    rdDealId: salesData.document.id,
    rdDealName: salesData.document.name,
    value: salesData.document.amount_total,
    dealStageId: salesData.document.deal_stage?.id,
    rdUpdatedAt: new Date(salesData.document.updated_at),
    rdUserId: salesData.document.user.id
  }
  const classification = STAGE_MAP[saleObject.dealStageId]

  if(!classification){
    await SalesRepository.cancelByDealId(saleObject.rdDealId, saleObject.rdUpdatedAt);
    return;
  }

  const sale = {...saleObject, ...classification};

  const vendor = await VendorRepository.findByRdId(sale.rdUserId);

  if(!vendor){
    console.warn(`Vendor ${sale.rdUserId} não cadastrado no sistema. Venda ${sale.rdDealId} não concluída`);
    return;
  }

  sale.vendorId = vendor._id;

  const savedObject = await SalesRepository.upsertActiveByDealId(sale);
  if (savedObject.created) {
    broadcast({sale: savedObject.sale, vendor: vendor});
  }
}