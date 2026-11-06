const AnalyticsService = require("../service/analyticsService");
const { getRoleSegment } = require("../../../config/roles");

exports.getGoalProgress = async (req, res, next) => {
  const [goalProgress, segments] = await Promise.all([
    AnalyticsService.getGoalProgress(),
    AnalyticsService.getSegmentGoalProgress(),
  ]);
  const data = { ...goalProgress, segments };
  return res.status(200).json({
    success: true,
    data,
    message: "Meta recuperada com sucesso",
  });
};

exports.getScoreboard = async (req, res, next) => {
  const period = req.query.period === "week" ? "week" : "all";
  const data = await AnalyticsService.getScoreboard(period);
  return res.status(200).json({
    success: true,
    data,
    message: "Placar recuperado com sucesso",
  });
};

exports.getSdrRanking = async (req, res, next) => {
  const { period } = req.query;
  const validPeriod = period === "week" ? "week" : "all";
  const data = await AnalyticsService.getSdrRanking(validPeriod);
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de SDRs recuperado com sucesso",
  });
};

exports.getLastWeekScoreboard = async (req, res, next) => {
  const data = await AnalyticsService.getScoreboard("lastWeek");
  return res.status(200).json({
    success: true,
    data,
    message: "Placar da semana passada recuperado com sucesso",
  });
};

exports.getLastWeekVendorRanking = async (req, res, next) => {
  const funnelType = req.query.vendorDepartment === "farm" ? "farm" : "sales";
  const data = await AnalyticsService.getVendorRanking("lastWeek", funnelType);
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de vendors da semana passada recuperado com sucesso",
  });
};

exports.getLastWeekSdrRanking = async (req, res, next) => {
  const data = await AnalyticsService.getSdrRanking("lastWeek");
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de SDRs da semana passada recuperado com sucesso",
  });
};

exports.getVendorRanking = async (req, res, next) => {
  const period = req.query.period === "week" ? "week" : "all";
  const funnelType = req.query.vendorDepartment === "farm" ? "farm" : "sales";
  const data = await AnalyticsService.getVendorRanking(period, funnelType);
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking recuperado com sucesso",
  });
};

// Precisa de login: b2b e b2g sempre recebem o próprio setor (o ?segment= é ignorado)
exports.getForecast = async (req, res, next) => {
  const requested = String(req.query.segment ?? "").toLowerCase();
  const segment = getRoleSegment(req.user.role) ?? (["b2b", "b2g"].includes(requested) ? requested : null);

  const data = await AnalyticsService.getForecast(segment);
  return res.status(200).json({
    success: true,
    data,
    message: "Forecast recuperado com sucesso",
  });
};
