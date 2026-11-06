const VendorsService = require("../../vendors/service/vendorsService");
const SalesService = require("../../sale/service/salesService");
const SdrService = require("../../sdr/service/sdrService");
const TeamsService = require("../../teams/service/teamsService");

const { getSalePoints, getPassagePoints } = require("../../../config/points.js");
const { BLACK_FRIDAY_GOAL, SEGMENT_GOALS } = require("../../../config/goal.js");
const { buildForecast } = require("./forecastCalculator");

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

const dayKeyOf = (date) => new Date(new Date(date).getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);

const nextDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const filterBySegment = (sales, segment) => (segment ? sales.filter((sale) => sale.segment === segment) : sales);

// Meta da Black: o front só exibe, o cálculo fica aqui (fonte única da verdade)
exports.getGoalProgress = async () => {
  const total = await SalesService.sumActiveValue();

  // Sem meta configurada, evita divisão por zero
  const percent =
    BLACK_FRIDAY_GOAL > 0
      ? Math.round((total / BLACK_FRIDAY_GOAL) * 10000) / 100
      : 0;

  return { goal: BLACK_FRIDAY_GOAL, total, percent };
};

// Sem meta configurada, evita divisão por zero
const calculatePercent = (total, goal) => (goal > 0 ? Math.round((total / goal) * 10000) / 100 : 0);

// Meta de cada setor (filtros B2B/B2G do admin). Fica separada da meta total
// para a resposta que a TV usa (goal, total, percent) continuar igual
exports.getSegmentGoalProgress = async () => {
  const totals = await SalesService.sumActiveValueBySegment();

  const segments = {};
  for (const segment of Object.keys(SEGMENT_GOALS)) {
    const goal = SEGMENT_GOALS[segment];
    const total = totals[segment] ?? 0;
    segments[segment] = { goal, total, percent: calculatePercent(total, goal) };
  }
  return segments;
};

// period: "week", "lastWeek" ou "all" (ver SalesService.findActiveByPeriod)
exports.getScoreboard = async (period) => {
  const [teams, vendors, sdrs, sales] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
    SalesService.findActiveByPeriod(period),
  ]);

  const vendorTeamMap = new Map(
    vendors.map((vendor) => [vendor._id.toString(), vendor.teamId.toString()]),
  );

  // A pessoa inteira (e não só o time): os pontos da passagem dependem do cargo dela
  const sdrMap = new Map(sdrs.map((sdr) => [sdr._id.toString(), sdr]));

  const teamPointsMap = new Map(
    teams.map((team) => [
      team._id.toString(),
      {
        teamId: team._id,
        teamName: team.name,
        teamShirt: team.imageUrl,
        farm: 0,
        sales: 0,
        passage: 0,
      },
    ]),
  );

  for (const sale of sales) {
    // Pontos de venda/renovação vão para o time do vendedor (valor pelo Setor da venda).
    // Venda sem vendedor (importada) só conta na meta
    const vendorTeamId =
      sale.vendorId && vendorTeamMap.get(sale.vendorId.toString());
    if (vendorTeamId && teamPointsMap.has(vendorTeamId)) {
      teamPointsMap.get(vendorTeamId)[sale.funnelType] += getSalePoints(sale);
    }

    // Cada pessoa da passagem dá pontos para o time dela, conforme o cargo
    // (duas pessoas do mesmo time na mesma venda = o time soma as duas)
    for (const sdrId of sale.sdrIds) {
      const sdr = sdrMap.get(sdrId.toString());
      if (!sdr) continue;
      const sdrTeamId = sdr.teamId.toString();
      if (teamPointsMap.has(sdrTeamId)) {
        teamPointsMap.get(sdrTeamId).passage += getPassagePoints(sdr);
      }
    }
  }

  return Array.from(teamPointsMap.values())
    .map((team) => ({ ...team, total: team.farm + team.sales + team.passage }))
    .sort((a, b) => b.total - a.total);
};

// funnelType: "sales" (Vendas) ou "farm" (Renovação)
exports.getVendorRanking = async (period, funnelType, segment = null) => {
  const [vendors, periodSales] = await Promise.all([
    VendorsService.findAll(),
    SalesService.findActiveByPeriod(period),
  ]);
  const sales = filterBySegment(periodSales, segment);

  const pointsByVendor = new Map();

  for (const sale of sales) {
    // Venda sem vendedor (importada) não entra no ranking
    if (sale.funnelType !== funnelType || !sale.vendorId) continue;
    const vendorId = sale.vendorId.toString();
    pointsByVendor.set(
      vendorId,
      (pointsByVendor.get(vendorId) || 0) + getSalePoints(sale),
    );
  }

  const ranked = vendors
    .filter((vendor) => pointsByVendor.has(vendor._id.toString()))
    .map((vendor) => ({
      vendorId: vendor._id,
      name: vendor.vendorName,
      job: vendor.job,
      teamId: vendor.teamId,
      points: pointsByVendor.get(vendor._id.toString()),
      imageUrl: vendor.imageUrl,
    }))
    .sort((a, b) => b.points - a.points);

  return {
    vendor: ranked.slice(0, 3),
  };
};

// Pontos de passagem: cada pessoa da passagem ganha, por venda, os pontos do cargo dela
exports.getSdrRanking = async (period, segment = null) => {
  const [sdrs, periodSales] = await Promise.all([
    SdrService.findAll(),
    SalesService.findActiveByPeriod(period),
  ]);
  const sales = filterBySegment(periodSales, segment);

  const sdrMap = new Map(sdrs.map((sdr) => [sdr._id.toString(), sdr]));
  const pointsBySdr = new Map();

  for (const sale of sales) {
    for (const saleSdrId of sale.sdrIds) {
      const sdrId = saleSdrId.toString();
      const sdr = sdrMap.get(sdrId);
      if (!sdr) continue;
      pointsBySdr.set(
        sdrId,
        (pointsBySdr.get(sdrId) || 0) + getPassagePoints(sdr),
      );
    }
  }

  return sdrs
    .filter((sdr) => pointsBySdr.has(sdr._id.toString()))
    .map((sdr) => ({
      sdrId: sdr._id,
      name: sdr.name,
      job: sdr.job,
      teamId: sdr.teamId,
      points: pointsBySdr.get(sdr._id.toString()),
      imageUrl: sdr.imageUrl,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
};

// Forecast da campanha e da semana (cenários pessimista, realista e otimista).
// segment: "b2b"/"b2g" usa só as vendas e a meta do setor; null = todos.
// Sem meta do setor configurada, usa a meta total (goalIsTotal avisa)
exports.getForecast = async (segment, now = new Date()) => {
  const sales = await SalesService.findActiveByPeriod("all");
  const segmentSales = segment ? sales.filter((sale) => sale.segment === segment) : sales;

  const segmentGoal = segment ? SEGMENT_GOALS[segment] : 0;
  const goal = segmentGoal > 0 ? segmentGoal : BLACK_FRIDAY_GOAL;

  return {
    segment,
    goalIsTotal: !(segmentGoal > 0),
    ...buildForecast({ sales: segmentSales, goal, now }),
  };
};

exports.getPointsHistory = async (segment = null, now = new Date()) => {
  const [teams, vendors, sdrs, allSales] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
    SalesService.findActiveByPeriod("all"),
  ]);
  const sales = filterBySegment(allSales, segment);

  const today = dayKeyOf(now);
  const saleDays = sales.map((sale) => dayKeyOf(sale.realizedAt)).filter((day) => day <= today);
  const firstDay = saleDays.sort()[0];

  const days = [];
  for (let day = firstDay; firstDay && day <= today; day = nextDay(day)) {
    days.push(day);
  }
  const dayIndex = new Map(days.map((day, index) => [day, index]));
  const zeros = () => days.map(() => 0);

  const vendorTeamMap = new Map(vendors.map((vendor) => [vendor._id.toString(), vendor.teamId.toString()]));
  const sdrMap = new Map(sdrs.map((sdr) => [sdr._id.toString(), sdr]));
  const teamMap = new Map(
    teams.map((team) => [
      team._id.toString(),
      { teamId: team._id, teamName: team.name, teamShirt: team.imageUrl, sales: zeros(), farm: zeros(), passage: zeros() },
    ]),
  );

  for (const sale of sales) {
    const index = dayIndex.get(dayKeyOf(sale.realizedAt));
    if (index === undefined) continue;

    const vendorTeam = sale.vendorId && teamMap.get(vendorTeamMap.get(sale.vendorId.toString()));
    if (vendorTeam) {
      vendorTeam[sale.funnelType][index] += getSalePoints(sale);
    }

    for (const sdrId of sale.sdrIds) {
      const sdr = sdrMap.get(sdrId.toString());
      const sdrTeam = sdr && teamMap.get(sdr.teamId.toString());
      if (sdrTeam) {
        sdrTeam.passage[index] += getPassagePoints(sdr);
      }
    }
  }

  const teamsHistory = Array.from(teamMap.values()).map((team) => ({
    ...team,
    total: days.map((_, index) => team.sales[index] + team.farm[index] + team.passage[index]),
  }));

  return {
    segment,
    days,
    teams: teamsHistory,
    total: days.map((_, index) => teamsHistory.reduce((sum, team) => sum + team.total[index], 0)),
  };
};
