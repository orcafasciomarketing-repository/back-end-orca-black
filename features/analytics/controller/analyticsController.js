const AnalyticsService = require("../service/analyticsService");

exports.getGoalProgress = async (req, res, next) => {
  const data = await AnalyticsService.getGoalProgress();
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
