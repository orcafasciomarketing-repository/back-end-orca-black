const PrizeWithdrawal = require("../model/prizeWithdrawalModel");

exports.findAll = async () => {
  return await PrizeWithdrawal.find({}).sort({ withdrawnAt: -1, createdAt: -1 }).lean();
};

exports.findByPerson = async (kind, personId) => {
  return await PrizeWithdrawal.find({ kind, personId }).sort({ withdrawnAt: -1, createdAt: -1 }).lean();
};

exports.create = async (data) => {
  return await PrizeWithdrawal.create(data);
};

exports.deleteById = async (id) => {
  return await PrizeWithdrawal.findByIdAndDelete(id);
};
