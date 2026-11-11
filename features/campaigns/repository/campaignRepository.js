const Campaign = require("../model/campaignModel");

exports.findAll = async () => {
  return await Campaign.find({}).sort({ start: -1, createdAt: -1 }).lean();
};

exports.findById = async (id) => {
  return await Campaign.findById(id).lean();
};

exports.findActive = async () => {
  return await Campaign.findOne({ active: true }).sort({ updatedAt: -1 }).lean();
};

exports.count = async () => {
  return await Campaign.countDocuments({});
};

exports.create = async (data) => {
  const created = await Campaign.create(data);
  return created.toObject();
};

exports.update = async (id, data) => {
  return await Campaign.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after", runValidators: true }).lean();
};

// Só uma campanha ativa: desmarca as outras
exports.deactivateOthers = async (id) => {
  await Campaign.updateMany({ _id: { $ne: id }, active: true }, { $set: { active: false } });
};

exports.deleteById = async (id) => {
  return await Campaign.findByIdAndDelete(id).lean();
};
