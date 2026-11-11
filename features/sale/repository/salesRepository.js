const Sales = require("../model/salesModel");

// As listas de vendas abaixo usam leitura leve (.lean()): vão direto para a resposta da API, e o JSON sai igual
// ao de antes, gastando bem menos CPU

// Período da campanha ({ from, to }, datas do banco): só as vendas feitas nele. Sem período, todas
const withRange = (filter, range) => (range ? { ...filter, realizedAt: { $gte: range.from, $lte: range.to } } : filter);

// segment: "b2b"/"b2g" traz só as vendas do setor; sem segment, todas
exports.findAll = async (page, limit, segment, range) => {
  const filter = withRange(segment ? { segment } : {}, range);
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find(filter)
    .populate("vendorId")
    .populate("sdrIds")
    .sort({ createdAt: -1 })
    .lean();
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

exports.findByPeriod = async (page, limit, startDate, endDate) => {
  const filter = {
    dealStatus: "ativa",
    realizedAt: { $gte: startDate, $lte: endDate },
  };
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find(filter).populate("vendorId").populate("sdrIds").lean();
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

exports.sumActiveValue = async (range) => {
  const [result] = await Sales.aggregate([
    { $match: withRange({ dealStatus: "ativa" }, range) },
    { $group: { _id: null, total: { $sum: "$value" } } },
  ]);
  return result?.total ?? 0;
};

exports.sumActiveValueBySegment = async (range) => {
  const results = await Sales.aggregate([
    { $match: withRange({ dealStatus: "ativa" }, range) },
    { $group: { _id: "$segment", total: { $sum: "$value" } } },
  ]);
  return Object.fromEntries(results.map(({ _id, total }) => [_id, total]));
};

// Leitura leve (.lean()): objetos simples em vez de documentos do Mongoose, bem mais rápido para ler e somar.
// Só para contas: quem usa só lê os campos (value, realizedAt, vendorId, sdrIds, segment, funnelType)
exports.findActiveByRealizedAt = async (startDate, endDate) => {
  const filter = { dealStatus: "ativa" };
  if (startDate && endDate) {
    filter.realizedAt = { $gte: startDate, $lte: endDate };
  }
  return await Sales.find(filter).lean();
};

exports.findByVendor = async (vendorId, segment, range) => {
  const filter = withRange(segment ? { vendorId, segment } : { vendorId }, range);
  const query = Sales.find(filter).populate("vendorId").populate("sdrIds").lean();
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

// Quantidade e soma das vendas ativas no período (lista de campanhas)
exports.summarizeActiveBetween = async (from, to) => {
  const [result] = await Sales.aggregate([
    { $match: withRange({ dealStatus: "ativa" }, { from, to }) },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$value" } } },
  ]);
  return { count: result?.count ?? 0, total: result?.total ?? 0 };
};

// Dia (AAAA-MM-DD, horário de São Paulo) da primeira e da última venda ativa; null sem vendas
exports.findActiveDayRange = async () => {
  const [result] = await Sales.aggregate([
    { $match: { dealStatus: "ativa" } },
    { $group: { _id: null, first: { $min: "$realizedAt" }, last: { $max: "$realizedAt" } } },
  ]);
  if (!result?.first) return null;
  const dayOf = (date) => new Date(new Date(date).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { first: dayOf(result.first), last: dayOf(result.last) };
};

// Vendas em que a pessoa participou da passagem
exports.findBySdr = async (sdrId) => {
  const filter = { sdrIds: sdrId };
  const query = Sales.find(filter).populate("vendorId").populate("sdrIds").lean();
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

// ===== Importação (vendas enviadas pelo admin, fora da planilha) =====

// Quantidade e soma das vendas importadas hoje (a prévia compara com o arquivo novo)
exports.summarizeImported = async () => {
  const [result] = await Sales.aggregate([
    { $match: { source: "importacao" } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$value" } } },
  ]);
  return { count: result?.count ?? 0, total: result?.total ?? 0 };
};

// Vendas da planilha (as antigas não têm source) para avisar de venda duplicada
exports.findSheetSalesForDuplicates = async () => {
  return await Sales.find(
    { source: { $ne: "importacao" }, dealStatus: "ativa" },
    { rdDealId: 1, rdDealName: 1, value: 1, realizedAt: 1 },
  ).lean();
};

exports.insertImported = async (sales) => {
  return await Sales.insertMany(sales);
};

// Remove as importadas de lotes anteriores. Nunca toca nas vendas da planilha
exports.deleteImportedExcept = async (importId) => {
  const result = await Sales.deleteMany({
    source: "importacao",
    importId: { $ne: importId },
  });
  return result.deletedCount;
};

exports.deleteImportBatch = async (importId) => {
  await Sales.deleteMany({ source: "importacao", importId });
};
