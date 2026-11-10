const MonthlyGoalService = require("../service/monthlyGoalService");
const { ValidationError, NotFoundError } = require("../../../shared/errors");

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const monthOf = (req) => {
  if (!MONTH.test(req.params.month)) throw ValidationError("Mês inválido (use AAAA-MM)");
  return req.params.month;
};

const segmentOf = (req) => {
  if (!["b2b", "b2g"].includes(req.params.segment)) throw ValidationError("Setor inválido");
  return req.params.segment;
};

exports.getMonth = async (req, res, next) => {
  const data = await MonthlyGoalService.getMonth(monthOf(req));
  return res.status(200).json({ success: true, data, message: "Metas recuperadas com sucesso" });
};

exports.getProgress = async (req, res, next) => {
  const data = await MonthlyGoalService.getProgress(monthOf(req));
  return res.status(200).json({ success: true, data, message: "Progresso das metas recuperado com sucesso" });
};

exports.getHistory = async (req, res, next) => {
  const months = req.query.months === undefined ? 6 : Number(req.query.months);
  if (!Number.isInteger(months) || months < 1 || months > 12) throw ValidationError("Quantidade de meses inválida (1 a 12)");
  const data = await MonthlyGoalService.getHistory(monthOf(req), months);
  return res.status(200).json({ success: true, data, message: "Histórico das metas recuperado com sucesso" });
};

exports.saveMonth = async (req, res, next) => {
  const data = await MonthlyGoalService.saveMonth(monthOf(req), segmentOf(req), req.data, req.user.email);
  return res.status(200).json({ success: true, data, message: "Metas salvas com sucesso" });
};

exports.deleteMonth = async (req, res, next) => {
  const deleted = await MonthlyGoalService.deleteMonth(monthOf(req), segmentOf(req));
  if (!deleted) throw NotFoundError("Meta não encontrada");
  return res.status(200).json({ success: true, message: "Metas excluídas com sucesso" });
};
