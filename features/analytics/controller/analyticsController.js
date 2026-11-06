const AnalyticsService = require("../service/analyticsService");
const { getRoleSegment } = require("../../../config/roles");

const toSegment = (value) => {
  const segment = String(value ?? "").toLowerCase();
  return ["b2b", "b2g"].includes(segment) ? segment : null;
};

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
  const data = await AnalyticsService.getSdrRanking(validPeriod, toSegment(req.query.segment));
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
  const data = await AnalyticsService.getVendorRanking("lastWeek", funnelType, toSegment(req.query.segment));
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de vendors da semana passada recuperado com sucesso",
  });
};

exports.getLastWeekSdrRanking = async (req, res, next) => {
  const data = await AnalyticsService.getSdrRanking("lastWeek", toSegment(req.query.segment));
  return res.status(200).json({
    success: true,
    data,
    message: "Ranking de SDRs da semana passada recuperado com sucesso",
  });
};

exports.getVendorRanking = async (req, res, next) => {
  const period = req.query.period === "week" ? "week" : "all";
  const funnelType = req.query.vendorDepartment === "farm" ? "farm" : "sales";
  const data = await AnalyticsService.getVendorRanking(period, funnelType, toSegment(req.query.segment));
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

exports.getPointsHistory = async (req, res, next) => {
  const segment = getRoleSegment(req.user.role) ?? toSegment(req.query.segment);

  const data = await AnalyticsService.getPointsHistory(segment);
  return res.status(200).json({
    success: true,
    data,
    message: "Histórico de pontos recuperado com sucesso",
  });
};

const PEOPLE_POINTS_PERIODS = ["all", "week", "lastWeek"];
const toDayKey = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : null);

// Precisa de login: b2b e b2g sempre recebem o próprio setor (o ?segment= é ignorado)
exports.getPeoplePoints = async (req, res, next) => {
  const segment = getRoleSegment(req.user.role) ?? toSegment(req.query.segment);
  const period = PEOPLE_POINTS_PERIODS.includes(req.query.period) ? req.query.period : "all";

  const data = await AnalyticsService.getPeoplePoints({
    period,
    segment,
    from: toDayKey(req.query.from),
    to: toDayKey(req.query.to),
  });
  return res.status(200).json({
    success: true,
    data,
    message: "Pontos por pessoa recuperados com sucesso",
  });
};
