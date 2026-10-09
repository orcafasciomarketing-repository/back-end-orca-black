const SalesRepository = require("../repository/salesRepository");
const VendorRepository = require("../../vendors/repository/vendorsRepository");
const { broadcast } = require("../../../shared/sseManager");
const { translateRdObject } = require("../adapters/rdDealAdapter");

const { STAGE_MAP } = require("../../../config/rdStages");

exports.create = async (salesData) => {
  const sale = await SalesRepository.create(salesData);

  broadcast(sale);
  return sale;
};

exports.findAll = async (page, limit) => {
  return await SalesRepository.findAll(page, limit);
};

exports.findByVendor = async (vendorId) => {
  return await SalesRepository.findByVendor(vendorId);
};

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

  return await SalesRepository.findByPeriod(
    page,
    limit,
    startOfWeek,
    finalOfWeek,
  );
};

exports.updateById = async (id, data) => {
  return await SalesRepository.updateById(id, data);
};

exports.findByExactWeek = async (page, limit) => {
  const today = new Date();
  const day = today.getDay() || 7;
  const start = today.getDate() - (day - 1) - 7;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(start);
  startOfWeek.setHours(0, 0, 0, 0);

  const finalOfWeek = new Date(today);
  finalOfWeek.setDate(start + 6);
  finalOfWeek.setHours(23, 59, 59, 999);

  return await SalesRepository.findByPeriod(
    page,
    limit,
    startOfWeek,
    finalOfWeek,
  );
};

exports.rdDealEventProcess = async (salesData) => {
  const saleObject = translateRdObject(salesData, STAGE_MAP);

  if (!saleObject.isBlackFriday) {
    await SalesRepository.cancelByDealId(
      saleObject.rdDealId,
      saleObject.rdUpdatedAt,
    );
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

  const savedObject = await SalesRepository.upsertActiveByDealId(saleObject);
  if (savedObject.created) {
    console.log("Objeto criado no banco");
    // broadcast({ sale: savedObject.sale, vendor: vendor });
  }
};
