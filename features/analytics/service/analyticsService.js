const VendorsService = require("../../vendors/service/vendorsService");
const SalesService = require("../../sale/service/salesService");
const SdrService = require("../../sdr/service/sdrService");
const TeamsService = require("../../teams/service/teamsService");
const CampaignService = require("../../campaigns/service/campaignService");

const { getSalePoints, getPassagePoints } = require("../../../config/points.js");
const { BLACK_FRIDAY_GOAL, SEGMENT_GOALS } = require("../../../config/goal.js");
const { buildForecast, combineForecasts } = require("./forecastCalculator");
const { forecastModelOf } = require("../../../config/forecastModels");

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

const dayKeyOf = (date) => new Date(new Date(date).getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);

const nextDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const filterBySegment = (sales, segment) => (segment ? sales.filter((sale) => sale.segment === segment) : sales);

// Todas as contas são de uma campanha: a recebida (admin, ?campaign=) ou, sem ela, a ativa (TVs e colaboradores).
// As vendas da campanha são as do período dela; a meta é a cadastrada nela
const campaignOf = async (campaign) => campaign ?? (await CampaignService.getActive());
const rangeOf = (campaign) => (campaign ? CampaignService.rangeOf(campaign) : undefined);
const salesOf = async (period, campaign) => SalesService.findActiveByPeriod(period, rangeOf(campaign));

// Meta da campanha: o front só exibe, o cálculo fica aqui (fonte única da verdade)
exports.getGoalProgress = async (campaign) => {
  const current = await campaignOf(campaign);
  const total = await SalesService.sumActiveValue(rangeOf(current));
  const goal = current ? current.goal : BLACK_FRIDAY_GOAL;

  // Sem meta configurada, evita divisão por zero
  const percent =
    goal > 0
      ? Math.round((total / goal) * 10000) / 100
      : 0;

  return { goal, total, percent };
};

// Sem meta configurada, evita divisão por zero
const calculatePercent = (total, goal) => (goal > 0 ? Math.round((total / goal) * 10000) / 100 : 0);

// Meta de cada setor (filtros B2B/B2G do admin). Fica separada da meta total
// para a resposta que a TV usa (goal, total, percent) continuar igual
exports.getSegmentGoalProgress = async (campaign) => {
  const current = await campaignOf(campaign);
  const totals = await SalesService.sumActiveValueBySegment(rangeOf(current));
  const goals = current ? current.goals : SEGMENT_GOALS;

  const segments = {};
  for (const segment of Object.keys(SEGMENT_GOALS)) {
    const goal = goals[segment] ?? 0;
    const total = totals[segment] ?? 0;
    segments[segment] = { goal, total, percent: calculatePercent(total, goal) };
  }
  return segments;
};

// period: "week", "lastWeek" ou "all" (ver SalesService.findActiveByPeriod)
exports.getScoreboard = async (period, campaign) => {
  const current = await campaignOf(campaign);
  const [teams, vendors, sdrs, sales] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
    salesOf(period, current),
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
exports.getVendorRanking = async (period, funnelType, segment = null, campaign) => {
  const current = await campaignOf(campaign);
  const [vendors, periodSales] = await Promise.all([
    VendorsService.findAll(),
    salesOf(period, current),
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
exports.getSdrRanking = async (period, segment = null, campaign) => {
  const current = await campaignOf(campaign);
  const [sdrs, periodSales] = await Promise.all([
    SdrService.findAll(),
    salesOf(period, current),
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
// month (AAAA-MM): forecast do mês da meta (as semanas que começam no mês), só com as vendas do mês e
// contra a Meta do cadastro de metas (do setor ou a soma; 0 sem meta cadastrada)
// campaign: a campanha do forecast (período e metas dela); sem ela, a ativa
exports.getForecast = async (segment, now = new Date(), month = null, campaign) => {
  if (month) return getMonthForecast(segment, now, month);

  const current = await campaignOf(campaign);
  const sales = await salesOf("all", current);

  const goals = current ? current.goals : SEGMENT_GOALS;
  const totalGoal = current ? current.goal : BLACK_FRIDAY_GOAL;
  const segmentGoal = segment ? goals[segment] ?? 0 : 0;
  const goal = segmentGoal > 0 ? segmentGoal : totalGoal;
  const range = current ? { start: current.start, end: current.end } : {};

  // Setor escolhido: o modelo dele. "Todos": a soma do forecast de cada setor, cada um com o seu modelo
  // (venda sem setor entra no B2B)
  return {
    segment,
    goalIsTotal: segment ? !(segmentGoal > 0) : true,
    period: { type: "campaign", ...(current && { campaignId: current.id, name: current.name }) },
    ...forecastBySegment({ sales, segment, goal, now, range }),
  };
};

// Setor escolhido: o modelo dele. Todos: a soma do forecast de cada setor (venda sem setor entra no B2B)
function forecastBySegment({ sales, segment, goal, now, range = {} }) {
  const segmentKey = (sale) => (sale.segment === "b2g" ? "b2g" : "b2b");
  if (segment) {
    return buildForecast({
      sales: sales.filter((sale) => sale.segment === segment),
      goal,
      now,
      model: forecastModelOf(segment),
      ...range,
    });
  }

  const parts = ["b2b", "b2g"].map((key) =>
    buildForecast({ sales: sales.filter((sale) => segmentKey(sale) === key), goal: 0, now, model: forecastModelOf(key), ...range }),
  );
  return combineForecasts({ total: buildForecast({ sales, goal, now, ...range }), parts, goal });
}

async function getMonthForecast(segment, now, month) {
  // Carregado aqui dentro: o serviço de metas depende (via prêmios) deste serviço
  const MonthlyGoalService = require("../../goals/service/monthlyGoalService");
  const { monthWeeks, dayKeyOf: goalDayKeyOf } = require("../../goals/service/goalCalculator");

  const weeks = monthWeeks(month);
  const start = weeks[0].start;
  const end = weeks[weeks.length - 1].end;
  const [allSales, tiers] = await Promise.all([
    SalesService.findActiveBetween(new Date(`${start}T03:00:00.000Z`), new Date(new Date(`${end}T03:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1)),
    MonthlyGoalService.getMonthTiers(month, segment),
  ]);
  const sales = allSales.filter((sale) => {
    const day = goalDayKeyOf(sale.realizedAt);
    return day >= start && day <= end;
  });
  const goal = tiers?.goal ?? 0;

  return {
    segment,
    goalIsTotal: false,
    period: { type: "month", month, start, end },
    monthTiers: tiers,
    ...forecastBySegment({ sales, segment, goal, now, range: { start, end } }),
  };
}

exports.getPointsHistory = async (segment = null, now = new Date(), campaign) => {
  const current = await campaignOf(campaign);
  const [teams, vendors, sdrs, allSales] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
    salesOf("all", current),
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

// Pontos de cada pessoa (vendedores e pessoas de passagem), com o time de cada uma.
// period: "all" | "week" | "lastWeek"; from/to (AAAA-MM-DD, horário de São Paulo) recortam ainda mais.
// Quem não pontuou também aparece, com 0
exports.getPeoplePoints = async ({ period = "all", segment = null, from = null, to = null, campaign } = {}) => {
  const current = await campaignOf(campaign);
  const [teams, vendors, sdrs, periodSales] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
    salesOf(period, current),
  ]);
  const sales = filterBySegment(periodSales, segment).filter((sale) => {
    const day = dayKeyOf(sale.realizedAt);
    return (!from || day >= from) && (!to || day <= to);
  });

  const emptyPoints = () => ({ sales: 0, farm: 0, passage: 0 });
  const vendorPoints = new Map(vendors.map((vendor) => [vendor._id.toString(), emptyPoints()]));
  const sdrMap = new Map(sdrs.map((sdr) => [sdr._id.toString(), sdr]));
  const sdrPoints = new Map(sdrs.map((sdr) => [sdr._id.toString(), emptyPoints()]));

  for (const sale of sales) {
    const vendor = sale.vendorId && vendorPoints.get(sale.vendorId.toString());
    if (vendor && sale.funnelType in vendor) {
      vendor[sale.funnelType] += getSalePoints(sale);
    }

    for (const saleSdrId of sale.sdrIds ?? []) {
      const sdrId = saleSdrId.toString();
      if (sdrPoints.has(sdrId)) {
        sdrPoints.get(sdrId).passage += getPassagePoints(sdrMap.get(sdrId));
      }
    }
  }

  const toPerson = (kind, person, name, points) => ({
    personId: person._id,
    kind,
    name,
    job: person.job,
    imageUrl: person.imageUrl,
    teamId: person.teamId ?? null,
    ...points,
    total: points.sales + points.farm + points.passage,
  });

  const people = [
    ...vendors.map((vendor) =>
      toPerson("vendor", vendor, vendor.vendorName, vendorPoints.get(vendor._id.toString())),
    ),
    ...sdrs.map((sdr) => toPerson("sdr", sdr, sdr.name, sdrPoints.get(sdr._id.toString()))),
  ].sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), "pt-BR"));

  return {
    segment,
    period,
    from,
    to,
    teams: teams
      .map((team) => ({ teamId: team._id, teamName: team.name, teamShirt: team.imageUrl }))
      .sort((a, b) => String(a.teamName).localeCompare(String(b.teamName), "pt-BR")),
    people,
  };
};

// Resultados guardados por alguns segundos (shared/resultCache.js): várias telas pedindo a mesma conta ao
// mesmo tempo fazem a conta uma vez só
const resultCache = require("../../../shared/resultCache");
for (const name of [
  "getGoalProgress",
  "getSegmentGoalProgress",
  "getScoreboard",
  "getVendorRanking",
  "getSdrRanking",
  "getForecast",
  "getPointsHistory",
  "getPeoplePoints",
]) {
  exports[name] = resultCache.memoize(`analytics.${name}`, exports[name]);
}
