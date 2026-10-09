const VendorsService = require("../../vendors/service/vendorsService");
const SalesService = require("../../sale/service/salesService");
const SdrService = require("../../sdr/service/sdrService");
const TeamsService = require("../../teams/service/teamsService");

exports.getScoreboard = async (period) => {
  const [teams, vendors, salesResult] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    period === "week" ? SalesService.findByPeriod() : SalesService.findAll(),
  ]);

  const vendorTeamMap = new Map(vendors.map((vendor) => [vendor._id.toString(), vendor.teamId.toString()]));

  const teamGoalsMap = new Map(
    teams.map((team) => [
      team._id.toString(),
      { teamId: team._id, teamName: team.name, goals: 0, teamShirt: team.imageUrl },
    ]),
  );

  for (const sale of salesResult.data) {
    const teamId = vendorTeamMap.get(sale.vendor._id.toString());
    if (teamId && teamGoalsMap.has(teamId)) {
      teamGoalsMap.get(teamId).goals++;
    }
  }

  return Array.from(teamGoalsMap.values()).sort((a, b) => b.goals - a.goals);
};

exports.getVendorRank = async (period) => {
  const [vendors, salesResult] = await Promise.all([
    VendorsService.findAll(),
    period === "week" ? SalesService.findByPeriod() : SalesService.findAll(),
  ]);

  const goalsByVendor = new Map();

  for (const sale of salesResult.data) {
    const vendorId = sale.vendor._id.toString();
    goalsByVendor.set(vendorId, (goalsByVendor.get(vendorId) || 0) + 1);
  }

  const ranked = vendors
    .filter((vendor) => goalsByVendor.has(vendor._id.toString()))
    .map((vendor) => ({
      vendorId: vendor._id,
      name: vendor.name,
      job: vendor.job,
      teamId: vendor.teamId,
      goals: goalsByVendor.get(vendor._id.toString()),
      imageUrl: vendor.imageUrl,
    }))
    .sort((a, b) => b.goals - a.goals);

  return {
    venda: ranked.filter((s) => s.job.endsWith("Venda")).slice(0, 3),
    farm: ranked.filter((s) => s.job.endsWith("Farmer")).slice(0, 3),
  };
};

exports.getSdrRank = async (period) => {
  const [sdrs, salesResult] = await Promise.all([
    SdrService.findAll(),
    period === "week" ? SalesService.findByPeriod() : SalesService.findAll(),
  ]);

  const goalsBySdr = new Map();

  for (const sale of salesResult.data) {
    if (!sale.sdrId) continue;
    const sdrId = sale.sdrId._id.toString();
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

exports.getLastWeekScoreboard = async () => {
  const [teams, vendors, salesResult] = await Promise.all([
    TeamsService.findAll(),
    VendorsService.findAll(),
    SalesService.findByExactWeek(),
  ]);

  const vendorTeamMap = new Map(vendors.map((vendor) => [vendor._id.toString(), vendor.teamId.toString()]));

  const teamGoalsMap = new Map(
    teams.map((team) => [
      team._id.toString(),
      { teamId: team._id, teamName: team.name, goals: 0, teamShirt: team.imageUrl },
    ]),
  );

  for (const sale of salesResult.data) {
    const teamId = vendorTeamMap.get(sale.vendor._id.toString());
    if (teamId && teamGoalsMap.has(teamId)) {
      teamGoalsMap.get(teamId).goals++;
    }
  }

  return Array.from(teamGoalsMap.values()).sort((a, b) => b.goals - a.goals);
};

exports.getLastWeekVendorRank = async () => {
  const [vendors, salesResult] = await Promise.all([
    VendorsService.findAll(),
    SalesService.findByExactWeek(),
  ]);

  const goalsByVendor = new Map();

  for (const sale of salesResult.data) {
    const vendorId = sale.vendor._id.toString();
    goalsByVendor.set(vendorId, (goalsByVendor.get(vendorId) || 0) + 1);
  }

  const ranked = vendors
    .filter((vendor) => goalsByVendor.has(vendor._id.toString()))
    .map((vendor) => ({
      vendorId: vendor._id,
      name: vendor.name,
      job: vendor.job,
      teamId: vendor.teamId,
      goals: goalsByVendor.get(vendor._id.toString()),
      imageUrl: vendor.imageUrl,
    }))
    .sort((a, b) => b.goals - a.goals);

  return {
    venda: ranked.filter((s) => s.job.endsWith("Venda")).slice(0, 3),
    farm: ranked.filter((s) => s.job.endsWith("Farmer")).slice(0, 3),
  };
};

exports.getLastWeekSdrRank = async () => {
  const [sdrs, salesResult] = await Promise.all([
    SdrService.findAll(),
    SalesService.findByExactWeek(),
  ]);

  const goalsBySdr = new Map();

  for (const sale of salesResult.data) {
    if (!sale.sdrId) continue;
    const sdrId = sale.sdrId._id.toString();
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

exports.getTeamLineup = async (teamId) => {
  const [vendors, sdrs] = await Promise.all([
    VendorsService.findByTeam(teamId),
    SdrService.findByTeam(teamId),
  ]);

  return { vendors, sdrs };
};

