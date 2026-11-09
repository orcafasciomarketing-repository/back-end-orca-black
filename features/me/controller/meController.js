const MeService = require("../service/meService");

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
