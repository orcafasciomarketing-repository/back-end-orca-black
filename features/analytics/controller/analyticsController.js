const AnalyticsService = require("../service/analyticsService");

exports.getScoreboard = async (req, res, next) => {
  const period = req.query.period === "week" ? "week" : "all";
  const data = await AnalyticsService.getScoreboard(period);
  return res.status(200).json({
    success: true,
    data,
    message: "Placar recuperado com sucesso",
  });
};

exports.getTeamLineup = async (req, res, next) => {
  const { teamId } = req.params;
  const data = await AnalyticsService.getTeamLineup(teamId);
  return res.status(200).json({
    success: true,
    data,
    message: "Escalação recuperada com sucesso",
  });
};

exports.getSdrRanking = async (req, res, next) => {
  const { period } = req.query;
  const validPeriod = period === "week" ? "week" : "all";
  const data = await AnalyticsService.getSdrRank(validPeriod);
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de SDRs recuperado com sucesso",
  });
};

exports.getLastWeekScoreboard = async (req, res, next) => {
  const data = await AnalyticsService.getLastWeekScoreboard();
  return res.status(200).json({
    success: true,
    data,
    message: "Placar da semana passada recuperado com sucesso",
  });
};

exports.getLastWeekSellerRanking = async (req, res, next) => {
  const data = await AnalyticsService.getLastWeekVendorRank();
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de vendors da semana passada recuperado com sucesso",
  });
};

exports.getLastWeekSdrRanking = async (req, res, next) => {
  const data = await AnalyticsService.getLastWeekSdrRank();
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de SDRs da semana passada recuperado com sucesso",
  });
};

exports.getSellerRanking = async (req, res, next) => {
  const period = req.query.period === "week" ? "week" : "all";
  const data = await AnalyticsService.getVendorRank(period);
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking recuperado com sucesso",
  });
};


