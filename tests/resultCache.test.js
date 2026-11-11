const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp, seedBase, clearDatabase } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const Teams = require("../features/teams/model/teamsModel");
const PrizeWithdrawal = require("../features/prizes/model/prizeWithdrawalModel");
const SalesRepository = require("../features/sale/repository/salesRepository");
const AnalyticsService = require("../features/analytics/service/analyticsService");
const PrizeService = require("../features/prizes/service/prizeService");
const resultCache = require("../shared/resultCache");

describe("Cache dos resultados das contas (shared/resultCache.js)", () => {
  let testApp;
  let seed;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    await PrizeWithdrawal.deleteMany({});
    seed = await seedBase();
  });

  const sale = (rdDealId, vendor, value) => ({
    rdDealId,
    vendorId: vendor._id,
    value,
    rdUpdatedAt: new Date(),
    segment: "b2b",
    funnelType: "sales",
    realizedAt: new Date(),
    dealStatus: "ativa",
  });

  const pointsOf = async (vendor) => {
    const { people } = await AnalyticsService.getPeoplePoints();
    return people.find((person) => String(person.personId) === String(vendor._id));
  };

  it("pedidos iguais ao mesmo tempo recebem a mesma resposta, calculada uma vez", async () => {
    resultCache.clear();
    const [a, b] = await Promise.all([AnalyticsService.getScoreboard("all"), AnalyticsService.getScoreboard("all")]);
    assert.equal(a, b);
    assert.notEqual(await AnalyticsService.getScoreboard("week"), a);
  });

  it("venda nova, cancelada ou apagada aparece na hora", async () => {
    assert.equal((await pointsOf(seed.vendorA1)).total, 0);
    await Sales.create(sale("r1", seed.vendorA1, 1000));
    const afterSale = (await pointsOf(seed.vendorA1)).total;
    assert.ok(afterSale > 0);

    await Sales.updateOne({ rdDealId: "r1" }, { $set: { dealStatus: "cancelada" } });
    assert.equal((await pointsOf(seed.vendorA1)).total, 0);

    await Sales.insertMany([sale("r2", seed.vendorA1, 1000)]);
    assert.equal((await pointsOf(seed.vendorA1)).total, afterSale);
    await Sales.deleteMany({});
    assert.equal((await pointsOf(seed.vendorA1)).total, 0);
  });

  it("mudar vendedor ou time aparece na hora", async () => {
    await AnalyticsService.getScoreboard("all");
    await Teams.updateOne({ _id: seed.teamA._id }, { $set: { name: "Time Renomeado" } });
    const scoreboard = await AnalyticsService.getScoreboard("all");
    assert.ok(scoreboard.some((team) => team.teamName === "Time Renomeado"));

    await Vendors.updateOne({ _id: seed.vendorA1._id }, { $set: { vendorName: "Novo Nome" } });
    assert.equal((await pointsOf(seed.vendorA1)).name, "Novo Nome");
  });

  it("registrar ou excluir uma retirada de prêmio atualiza o resumo na hora", async () => {
    const withdrawnOf = async () =>
      (await PrizeService.getSummary(null)).people.find((person) => String(person.personId) === String(seed.vendorA1._id))
        ?.withdrawn ?? 0;

    assert.equal(await withdrawnOf(), 0);
    const created = await PrizeWithdrawal.create({
      personId: seed.vendorA1._id,
      kind: "vendor",
      quantity: 2,
      withdrawnAt: new Date(),
      createdBy: "master@teste.com",
    });
    assert.equal(await withdrawnOf(), 2);
    await PrizeWithdrawal.deleteOne({ _id: created._id });
    assert.equal(await withdrawnOf(), 0);
  });

  it("as vendas para as contas vêm em leitura leve (objetos simples, não documentos do Mongoose)", async () => {
    await Sales.create(sale("l1", seed.vendorA1, 500));
    const [found] = await SalesRepository.findActiveByRealizedAt();
    assert.equal(typeof found.save, "undefined");
    assert.equal(String(found.vendorId), String(seed.vendorA1._id));
    assert.equal(found.value, 500);
  });

  it("listas de vendas em leitura leve: o JSON da resposta é idêntico ao de antes", async () => {
    await Sales.create([
      { ...sale("j1", seed.vendorA1, 700), sdrIds: [seed.sdrB._id] },
      sale("j2", seed.vendorA1, 300),
    ]);
    const full = (filter) => Sales.find(filter).populate("vendorId").populate("sdrIds");
    const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

    same((await SalesRepository.findByVendor(seed.vendorA1._id)).data, await full({ vendorId: seed.vendorA1._id }));
    same((await SalesRepository.findBySdr(seed.sdrB._id)).data, await full({ sdrIds: seed.sdrB._id }));
    same((await SalesRepository.findAll()).data, await full({}).sort({ createdAt: -1 }));
  });
});
