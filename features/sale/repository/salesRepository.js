const Sales = require("../model/salesModel");

exports.create = async (salesData) => {
  const sales = await Sales.create(salesData);

  return await Sales.findById(sales._id).populate("vendor").populate("sdrId");
};

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
  const filter = { realizedAt: { $gte: startDate, $lte: endDate } };
  const hasPagination = page !== undefined && limit !== undefined;
  let query = Sales.find(filter).populate("vendor").populate("sdrId");
  if (hasPagination) {
    query = query.skip((page - 1) * limit).limit(limit);
  }
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

exports.updateById = async (id, data) => {
  return await Sales.findByIdAndUpdate(id, data, { returnDocument: "after" });
};

exports.findByVendor = async (vendorId) => {
  const filter = { vendor: vendorId };
  const query = Sales.find(filter).populate("vendor");
  return {
    data: await query,
    total: await Sales.countDocuments(filter),
  };
};

exports.upsertActiveByDealId = async (sale) => {
  try {
    const saleInfo = await Sales.findOneAndUpdate(
      { rdDealId: sale.rdDealId, rdUpdatedAt: { $lt: sale.rdUpdatedAt } },
      {
        $set: {
          rdDealName: sale.rdDealName,
          value: sale.value,
          vendorId: sale.vendorId,
          segment: sale.segment,
          funnelType: sale.funnelType,
          rdUpdatedAt: sale.rdUpdatedAt,
          dealStatus: "ativa",
        },
        $setOnInsert: { realizedAt: sale.rdUpdatedAt },
      },
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

exports.cancelByDealId = async (rdDealId, rdUpdatedAt) => {
  return await Sales.findOneAndUpdate(
    { rdDealId, rdUpdatedAt: { $lt: rdUpdatedAt }, dealStatus: "ativa" },
    { $set: { dealStatus: "cancelada", rdUpdatedAt } },
    { returnDocument: "after" },
  );
};
