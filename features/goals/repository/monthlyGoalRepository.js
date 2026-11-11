const MonthlyGoal = require("../model/monthlyGoalModel");

exports.findByMonth = async (month) => {
  return await MonthlyGoal.find({ month }).lean();
};

exports.findOne = async (month, segment) => {
  return await MonthlyGoal.findOne({ month, segment }).lean();
};

// Listagem dos meses cadastrados, do mais novo para o mais antigo
exports.findAll = async () => {
  return await MonthlyGoal.find({}).sort({ month: -1, segment: 1 }).lean();
};

// Só o que o vendedor pode ver de cada mês (para o histórico de "Minhas metas")
exports.findVisibilityByMonths = async (months) => {
  return await MonthlyGoal.find({ month: { $in: months } }, { month: 1, segment: 1, visibility: 1 }).lean();
};

exports.updateVisibility = async (month, segment, visibility) => {
  return await MonthlyGoal.findOneAndUpdate({ month, segment }, { $set: { visibility } }, { returnDocument: "after", runValidators: true }).lean();
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
