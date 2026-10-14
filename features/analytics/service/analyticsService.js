const VendorsService = require("../../vendors/service/vendorsService");
const SalesService = require("../../sale/service/salesService");
const SdrService = require("../../sdr/service/sdrService");
const TeamsService = require("../../teams/service/teamsService");

const { pointsMap } = require("../../../config/points.js");
const { BLACK_FRIDAY_GOAL } = require("../../../config/goal.js");

// Meta da Black: o front só exibe, o cálculo fica aqui (fonte única da verdade)
exports.getGoal = async () => {
  const total = await SalesService.sumActiveValue();

  // Sem meta configurada, evita divisão por zero
  const percent =
    BLACK_FRIDAY_GOAL > 0
      ? Math.round((total / BLACK_FRIDAY_GOAL) * 10000) / 100
      : 0;

  return { goal: BLACK_FRIDAY_GOAL, total, percent };
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

  const sdrTeamMap = new Map(
    sdrs.map((sdr) => [sdr._id.toString(), sdr.teamId.toString()]),
  );

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
    // Pontos de venda/renovação vão para o time do vendedor
    const vendorTeamId = vendorTeamMap.get(sale.vendorId.toString());
    if (vendorTeamId && teamPointsMap.has(vendorTeamId)) {
      teamPointsMap.get(vendorTeamId)[sale.funnelType] += pointsMap.get(
        sale.funnelType,
      );
    }

    // Pontos de passagem vão para o time de quem fez a passagem
    if (!sale.sdrId) continue;
    const sdrTeamId = sdrTeamMap.get(sale.sdrId.toString());
    if (sdrTeamId && teamPointsMap.has(sdrTeamId)) {
      teamPointsMap.get(sdrTeamId).passage += pointsMap.get("passage");
    }
  }

  return Array.from(teamPointsMap.values())
    .map((team) => ({ ...team, total: team.farm + team.sales + team.passage }))
    .sort((a, b) => b.total - a.total);
};

// funnelType: "sales" (Vendas) ou "farm" (Renovação)
exports.getVendorRank = async (period, funnelType) => {
  const [vendors, sales] = await Promise.all([
    VendorsService.findAll(),
    SalesService.findActiveByPeriod(period),
  ]);

  const pointsByVendor = new Map();

  for (const sale of sales) {
    if (sale.funnelType !== funnelType) continue;
    const vendorId = sale.vendorId.toString();
    pointsByVendor.set(
      vendorId,
      (pointsByVendor.get(vendorId) || 0) + pointsMap.get(sale.funnelType),
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

exports.getSdrRank = async (period) => {
  const [sdrs, sales] = await Promise.all([
    SdrService.findAll(),
    SalesService.findActiveByPeriod(period),
  ]);

  const goalsBySdr = new Map();

  for (const sale of sales) {
    if (!sale.sdrId) continue;
    const sdrId = sale.sdrId.toString();
    goalsBySdr.set(sdrId, (goalsBySdr.get(sdrId) || 0) + 1);
  }

  return sdrs
    .filter((sdr) => goalsBySdr.has(sdr._id.toString()))
    .map((sdr) => ({
      sdrId: sdr._id,
      name: sdr.name,
      job: sdr.job,
      teamId: sdr.teamId,
      goals: goalsBySdr.get(sdr._id.toString()),
      imageUrl: sdr.imageUrl,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 3);
};
