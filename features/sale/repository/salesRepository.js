const Sales = require("../model/salesModel");

exports.findAll = async (page, limit) => {
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find({})
    .populate("vendorId")
    .populate("sdrIds")
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
  let query = Sales.find(filter).populate("vendorId").populate("sdrIds");
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
  const query = Sales.find(filter).populate("vendorId").populate("sdrIds");
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

// Dados da planilha gravados na venda, com o status decidido pelo service
const buildSaleUpdate = (sale, dealStatus) => {
  const update = {
    $set: {
      rdDealName: sale.rdDealName,
      value: sale.value,
      vendorId: sale.vendorId,
      segment: sale.segment,
      funnelType: sale.funnelType,
      rdUpdatedAt: sale.rdUpdatedAt,
      // Data digitada na planilha: corrigir a data também atualiza a venda (e a semana dela)
      realizedAt: sale.realizedAt,
      dealStatus,
      // Sempre grava a lista inteira: lista vazia limpa as passagens tiradas da planilha
      sdrIds: sale.sdrIds ?? [],
    },
  };

  return update;
};

exports.upsertActiveByDealId = async (sale) => {
  const update = buildSaleUpdate(sale, "ativa");

  try {
    // $lte: um envio com o mesmo "Atualizado em" (ex.: linhas do mesmo lote) também é aplicado.
    // Só um envio mais antigo que o salvo é ignorado (cai no E11000 abaixo).
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

// Linha cancelada com os dados completos: atualiza os dados e deixa cancelada.
// Sem upsert: só mexe em venda que já existe (linha que nunca foi concluída não vira venda).
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
