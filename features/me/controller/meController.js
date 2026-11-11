const MeService = require("../service/meService");
const { ValidationError } = require("../../../shared/errors");

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

// Mês atual no horário de São Paulo (AAAA-MM)
const currentMonth = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);

const TEAM_PERIODS = ["all", "week", "lastWeek"];

exports.getProfile = async (req, res, next) => {
  const data = await MeService.getProfile(req.user);
  return res
    .status(200)
    .json({ success: true, data, message: "Perfil recuperado com sucesso" });
};

exports.getSales = async (req, res, next) => {
  const data = await MeService.getSales(req.user);
  return res
    .status(200)
    .json({ success: true, data, message: "Vendas recuperadas com sucesso" });
};

exports.getTeam = async (req, res, next) => {
  const period = TEAM_PERIODS.includes(req.query.period)
    ? req.query.period
    : "all";
  const data = await MeService.getTeam(req.user, period);
  return res
    .status(200)
    .json({ success: true, data, message: "Time recuperado com sucesso" });
};

exports.getPrizes = async (req, res, next) => {
  const data = await MeService.getPrizes(req.user);
  return res
    .status(200)
    .json({ success: true, data, message: "Prêmios recuperados com sucesso" });
};

// ?month=AAAA-MM (sem ele, o mês atual)
exports.getGoals = async (req, res, next) => {
  const month = req.query.month === undefined || req.query.month === "" ? currentMonth() : String(req.query.month);
  if (!MONTH.test(month)) throw ValidationError("Mês inválido (use AAAA-MM)");
  const data = await MeService.getGoals(req.user, month);
  return res
    .status(200)
    .json({ success: true, data, message: "Metas recuperadas com sucesso" });
};
