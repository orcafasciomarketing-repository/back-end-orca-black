const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp, seedBase, clearDatabase, createUserToken, TEST_POINTS } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const User = require("../features/user/model/userModel");

const DAY_MS = 24 * 60 * 60 * 1000;

const saoPauloDay = (daysAgo) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(new Date(`${today}T12:00:00Z`).getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10);
};

const midnightOf = (day) => new Date(`${day}T03:00:00.000Z`);

describe("GET /analytics/points-history", () => {
  let testApp;
  let tokens;
  let seed;
  const days = [saoPauloDay(2), saoPauloDay(1), saoPauloDay(0)];

  before(async () => {
    testApp = await startTestApp();
    await clearDatabase();
    await User.deleteMany({});
    seed = await seedBase();
    tokens = { admin: await createUserToken("admin"), b2b: await createUserToken("b2b") };

    const buildSale = (rdDealId, vendor, segment, funnelType, day, extra = {}) => ({
      rdDealId,
      vendorId: vendor._id,
      value: 1000,
      rdUpdatedAt: new Date(),
      segment,
      funnelType,
      realizedAt: midnightOf(day),
      dealStatus: "ativa",
      ...extra,
    });

    await Sales.create([
      buildSale("h1", seed.vendorA1, "b2b", "sales", days[0], { sdrIds: [seed.sdrB._id] }),
      buildSale("h2", seed.vendorB1, "b2g", "farm", days[1], { sdrIds: [seed.sdrG._id] }),
      buildSale("h3", seed.vendorC1, "b2g", "sales", days[2], { dealStatus: "cancelada" }),
    ]);
  });

  after(async () => {
    await testApp.stop();
  });

  const getHistory = async (token, query = "") => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${testApp.baseUrl}/analytics/points-history${query}`, { headers });
    return { status: res.status, body: await res.json() };
  };

  const teamOf = (data, name) => data.teams.find((team) => team.teamName === name);

  it("sem login → 401 (é do admin, não das TVs)", async () => {
    const { status } = await getHistory(null);
    assert.equal(status, 401);
  });

  it("pontos de cada time por dia, da primeira venda até hoje, separados em venda, renovação e passagem", async () => {
    const { status, body } = await getHistory(tokens.admin);
    const { data } = body;

    assert.equal(status, 200);
    assert.equal(data.segment, null);
    assert.deepEqual(data.days, days);
    assert.deepEqual(teamOf(data, "Time A").sales, [TEST_POINTS.b2bSale, 0, 0]);
    assert.deepEqual(teamOf(data, "Time B").passage, [TEST_POINTS.b2bSdr, 0, 0]);
    assert.deepEqual(teamOf(data, "Time B").farm, [0, TEST_POINTS.b2gFarm, 0]);
    assert.deepEqual(teamOf(data, "Time B").total, [TEST_POINTS.b2bSdr, TEST_POINTS.b2gFarm, 0]);
    assert.deepEqual(teamOf(data, "Time C").passage, [0, TEST_POINTS.b2gSdr, 0]);
    assert.deepEqual(data.total, [
      TEST_POINTS.b2bSale + TEST_POINTS.b2bSdr,
      TEST_POINTS.b2gFarm + TEST_POINTS.b2gSdr,
      0,
    ]);
    assert.equal(teamOf(data, "Time A").teamShirt, "http://teste/camiseta_amarela.png");
  });

  it("com ?segment=b2g: só as vendas B2G, começando na primeira delas", async () => {
    const { body } = await getHistory(tokens.admin, "?segment=b2g");

    assert.equal(body.data.segment, "b2g");
    assert.deepEqual(body.data.days, days.slice(1));
    assert.deepEqual(body.data.total, [TEST_POINTS.b2gFarm + TEST_POINTS.b2gSdr, 0]);
  });

  it("perfil b2b recebe sempre o B2B, mesmo pedindo outro setor", async () => {
    const { body } = await getHistory(tokens.b2b, "?segment=b2g");

    assert.equal(body.data.segment, "b2b");
    assert.deepEqual(body.data.total, [TEST_POINTS.b2bSale + TEST_POINTS.b2bSdr, 0, 0]);
  });
});
