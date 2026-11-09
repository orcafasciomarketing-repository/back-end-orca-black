const MonthlyGoal = require("../model/monthlyGoalModel");

exports.findByMonth = async (month) => {
  return await MonthlyGoal.find({ month }).lean();
};

// Último mês cadastrado antes deste, para copiar ao abrir um mês novo
exports.findLatestBefore = async (month, segment) => {
  return await MonthlyGoal.findOne({ segment, month: { $lt: month } })
    .sort({ month: -1 })
    .lean();
};

exports.upsert = async (month, segment, data) => {
  return await MonthlyGoal.findOneAndUpdate(
    { month, segment },
    { $set: { ...data, month, segment } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
};

exports.deleteOne = async (month, segment) => {
  return await MonthlyGoal.findOneAndDelete({ month, segment });
};
