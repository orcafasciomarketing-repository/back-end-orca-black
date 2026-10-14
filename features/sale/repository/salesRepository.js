const Sales = require("../model/salesModel");

exports.findAll = async (page, limit) => {
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find({})
    .populate("vendorId")
    .populate("sdrId")
    .sort({ createdAt: -1 });
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  return {
    data: await query,
    total: await Sales.countDocuments({}),
  };
};

exports.findByPeriod = async (page, limit, startDate, endDate) => {
  const filter = {
    dealStatus: "ativa",
    realizedAt: { $gte: startDate, $lte: endDate },
  };
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find(filter).populate("vendorId").populate("sdrId");
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

exports.sumActiveValue = async () => {
  const [result] = await Sales.aggregate([
    { $match: { dealStatus: "ativa" } },
    { $group: { _id: null, total: { $sum: "$value" } } },
  ]);
  return result?.total ?? 0;
};

exports.findActiveByRealizedAt = async (startDate, endDate) => {
  const filter = { dealStatus: "ativa" };
  if (startDate && endDate) {
    filter.realizedAt = { $gte: startDate, $lte: endDate };
  }
  return await Sales.find(filter);
};

exports.findByVendor = async (vendorId) => {
  const filter = { vendorId };
  const query = Sales.find(filter).populate("vendorId").populate("sdrId");
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

// Dados da RD gravados na venda, com o status decidido pelo service
const buildSaleUpdate = (sale, dealStatus) => {
  const update = {
    $set: {
      rdDealName: sale.rdDealName,
      value: sale.value,
      vendorId: sale.vendorId,
      segment: sale.segment,
      funnelType: sale.funnelType,
      rdUpdatedAt: sale.rdUpdatedAt,
      dealStatus,
    },
  };

  if (sale.sdrId) {
    update.$set.sdrId = sale.sdrId;
  } else {
    // Sem passagem: remove o campo (cobre a passagem tirada do deal na RD)
    update.$unset = { sdrId: "" };
  }

  return update;
};

exports.upsertActiveByDealId = async (sale) => {
  const update = buildSaleUpdate(sale, "ativa");
  update.$setOnInsert = { realizedAt: sale.rdUpdatedAt };

  try {
    // $lte: a RD não muda o updated_at quando só um custom field é editado,
    // então um evento com o mesmo updated_at também precisa ser aplicado.
    // Só um evento mais antigo é ignorado (cai no E11000 abaixo).
    const saleInfo = await Sales.findOneAndUpdate(
      { rdDealId: sale.rdDealId, rdUpdatedAt: { $lte: sale.rdUpdatedAt } },
      update,
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
        includeResultMetadata: true,
      },
    );

    return {
      sale: saleInfo.value,
      created: !saleInfo.lastErrorObject.updatedExisting,
    };
  } catch (err) {
    if (err.code === 11000) return { sale: null, created: false };
    throw err;
  }
};

// Deal na etapa Blackfriday mas não ganho: atualiza os dados e deixa cancelada.
// Sem upsert: só mexe em venda que já existe (deal que nunca foi ganho não vira venda).
exports.updateCanceledByDealId = async (sale) => {
  return await Sales.findOneAndUpdate(
    { rdDealId: sale.rdDealId, rdUpdatedAt: { $lte: sale.rdUpdatedAt } },
    buildSaleUpdate(sale, "cancelada"),
    { returnDocument: "after", runValidators: true },
  );
};

exports.cancelByDealId = async (rdDealId, rdUpdatedAt) => {
  return await Sales.findOneAndUpdate(
    { rdDealId, rdUpdatedAt: { $lte: rdUpdatedAt }, dealStatus: "ativa" },
    { $set: { dealStatus: "cancelada", rdUpdatedAt } },
    { returnDocument: "after" },
  );
};
