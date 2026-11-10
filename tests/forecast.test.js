const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  createUserToken,
  TEST_GOAL,
  TEST_SEGMENT_GOALS,
} = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const MonthlyGoal = require("../features/goals/model/monthlyGoalModel");
const User = require("../features/user/model/userModel");

// As contas do forecast estão em forecastCalculator.test.js. Aqui: login, setor de cada perfil e meta
describe("GET /analytics/forecast", () => {
  let testApp;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
    await clearDatabase();
    await User.deleteMany({});
    const seed = await seedBase();
    tokens = {
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      b2g: await createUserToken("b2g"),
    };

    const buildSale = (rdDealId, segment, value, dealStatus = "ativa") => ({
      rdDealId,
      vendorId: seed.vendorA1._id,
      value,
      rdUpdatedAt: new Date(),
      segment,
      funnelType: "sales",
      realizedAt: new Date("2026-11-03T03:00:00.000Z"),
      dealStatus,
    });
    await Sales.create([
      buildSale("b2b-1", "b2b", 1000),
      buildSale("b2g-1", "b2g", 500),
      buildSale("b2b-cancelada", "b2b", 9999, "cancelada"),
    ]);
  });

  after(async () => {
    await testApp.stop();
  });

  const getForecast = async (token, query = "") => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${testApp.baseUrl}/analytics/forecast${query}`, { headers });
    return { status: res.status, body: await res.json() };
  };

  it("sem login → 401 (é do admin, não das TVs)", async () => {
    assert.equal((await getForecast()).status, 401);
  });

  it("admin sem setor: vendas ativas de todos os setores contra a meta total", async () => {
    const { status, body } = await getForecast(tokens.admin);

    assert.equal(status, 200);
    assert.equal(body.data.segment, null);
    assert.equal(body.data.goal, TEST_GOAL);
    assert.equal(body.data.goalIsTotal, true);
    assert.equal(body.data.campaign.sold, 1500);
    assert.equal(body.data.model.key, "total");
    assert.deepEqual(
      body.data.model.parts.map((part) => part.key),
      ["b2b", "b2g"],
    );
  });

  it("cada setor usa o seu modelo; o B2G, por enquanto, o do B2B", async () => {
    assert.equal((await getForecast(tokens.admin, "?segment=b2b")).body.data.model.key, "b2b");
    const b2g = (await getForecast(tokens.admin, "?segment=b2g")).body.data.model;
    assert.deepEqual([b2g.key, b2g.basedOn], ["b2g", "b2b"]);
  });

  it("admin com ?segment=b2g: só B2G, contra a meta do B2G", async () => {
    const { body } = await getForecast(tokens.admin, "?segment=B2G");

    assert.equal(body.data.segment, "b2g");
    assert.equal(body.data.goal, TEST_SEGMENT_GOALS.b2g);
    assert.equal(body.data.goalIsTotal, false);
    assert.equal(body.data.campaign.sold, 500);
  });

  it("b2b recebe sempre o B2B, mesmo pedindo outro setor", async () => {
    const { body } = await getForecast(tokens.b2b, "?segment=b2g");

    assert.equal(body.data.segment, "b2b");
    assert.equal(body.data.goal, TEST_SEGMENT_GOALS.b2b);
    assert.equal(body.data.campaign.sold, 1000);
  });

  it("b2g recebe sempre o B2G", async () => {
    const { body } = await getForecast(tokens.b2g);

    assert.equal(body.data.segment, "b2g");
    assert.equal(body.data.campaign.sold, 500);
  });

  it("setor inválido no ?segment= vira todos", async () => {
    const { body } = await getForecast(tokens.admin, "?segment=xyz");

    assert.equal(body.data.segment, null);
    assert.equal(body.data.campaign.sold, 1500);
  });

  it("devolve campanha, semana e o gráfico", async () => {
    const { body } = await getForecast(tokens.admin);

    assert.deepEqual(Object.keys(body.data.campaign.scenarios), ["pessimistic", "realistic", "optimistic"]);
    assert.deepEqual(Object.keys(body.data.week.scenarios), ["pessimistic", "realistic", "optimistic"]);
    assert.equal(body.data.campaign.start, "2026-11-03");
    assert.equal(body.data.campaign.end, "2026-12-01");
    assert.equal(body.data.trajectory.days.length, 24);
  });

  describe("?month=AAAA-MM (forecast do mês)", () => {
    after(async () => {
      await MonthlyGoal.deleteMany({});
    });

    it("mês sem meta cadastrada: só as vendas do mês, meta 0", async () => {
      const { status, body } = await getForecast(tokens.admin, "?month=2026-11");

      assert.equal(status, 200);
      assert.deepEqual(body.data.period, { type: "month", month: "2026-11", start: "2026-11-02", end: "2026-12-06" });
      assert.equal(body.data.campaign.start, "2026-11-02");
      assert.equal(body.data.campaign.end, "2026-12-06");
      assert.equal(body.data.campaign.sold, 1500);
      assert.equal(body.data.goal, 0);
      assert.equal(body.data.monthTiers, null);
    });

    it("com meta cadastrada: a Meta do setor (ou a soma) e as faixas; mês sem vendas → vendido 0", async () => {
      await MonthlyGoal.create({
        month: "2026-10",
        segment: "b2b",
        farmGoal: 6000,
        salesGoal: 4000,
        superPercent: 120,
        levels: [{ key: "jr", name: "Júnior", weight: 1 }],
        people: [],
      });

      const b2b = (await getForecast(tokens.admin, "?month=2026-10&segment=b2b")).body.data;
      assert.equal(b2b.goal, 10000);
      assert.deepEqual(b2b.monthTiers, { goal: 10000, super: 12000, black: 0 });
      assert.equal(b2b.campaign.sold, 0);
      assert.equal(b2b.model.key, "b2b");

      const all = (await getForecast(tokens.admin, "?month=2026-10")).body.data;
      assert.equal(all.goal, 10000);
      assert.equal(all.model.key, "total");
      assert.equal((await getForecast(tokens.admin, "?month=2026-10&segment=b2g")).body.data.goal, 0);
    });

    it("b2b continua preso ao próprio setor; mês inválido → 400", async () => {
      assert.equal((await getForecast(tokens.b2b, "?month=2026-11&segment=b2g")).body.data.segment, "b2b");
      assert.equal((await getForecast(tokens.admin, "?month=2026-13")).status, 400);
      assert.equal((await getForecast(tokens.admin, "?month=novembro")).status, 400);
    });
  });
});
