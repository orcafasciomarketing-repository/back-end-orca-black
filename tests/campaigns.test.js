const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp, seedBase, clearDatabase, createUserToken, TEST_GOAL, TEST_SEGMENT_GOALS } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const User = require("../features/user/model/userModel");
const Campaign = require("../features/campaigns/model/campaignModel");
const MonthlyGoal = require("../features/goals/model/monthlyGoalModel");
const PrizeWithdrawal = require("../features/prizes/model/prizeWithdrawalModel");
const { generateAccessToken } = require("../shared/accessTokenService");

// A primeira campanha nasce sozinha do config/campaign.js (03/11 a 01/12/2026) e das metas do .env dos testes.
// "Março" é uma campanha nova, de 01/03 a 31/03/2027
describe("Campanhas", () => {
  let testApp;
  let seed;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  const at = (day) => new Date(`${day}T15:00:00.000Z`);
  const sale = (rdDealId, vendor, day, value, extra = {}) => ({
    rdDealId,
    vendorId: vendor._id,
    value,
    rdUpdatedAt: at(day),
    segment: "b2b",
    funnelType: "sales",
    realizedAt: at(day),
    dealStatus: "ativa",
    ...extra,
  });

  beforeEach(async () => {
    await clearDatabase();
    await Promise.all([
      User.deleteMany({}),
      Campaign.deleteMany({}),
      MonthlyGoal.deleteMany({}),
      PrizeWithdrawal.deleteMany({}),
    ]);
    seed = await seedBase();
    await User.collection.insertOne({ email: "a1@teste.com", passwordHash: "x", role: "vendor", vendorId: seed.vendorA1._id });
    await User.collection.insertOne({ email: "b1@teste.com", passwordHash: "x", role: "vendor", vendorId: seed.vendorB1._id });
    await User.collection.insertOne({ email: "sdr@teste.com", passwordHash: "x", role: "sdr", sdrId: seed.sdrB._id });
    const tokenOf = async (email) => {
      const user = await User.findOne({ email });
      return generateAccessToken({ id: user._id, email: user.email });
    };
    tokens = {
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      vendorA1: await tokenOf("a1@teste.com"),
      vendorB1: await tokenOf("b1@teste.com"),
      sdr: await tokenOf("sdr@teste.com"),
    };
  });

  const request = async (method, path, token, body) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  };

  const march = (extra = {}) => ({
    name: "Março",
    start: "2027-03-01",
    end: "2027-03-31",
    goals: { b2b: 5000, b2g: 2000 },
    ...extra,
  });

  const listCampaigns = async () => (await request("GET", "/campaigns", tokens.admin)).body.data;

  describe("primeira campanha (a que era fixa no código)", () => {
    it("é criada sozinha, ativa e com Meta black, com as datas do config e as metas do .env", async () => {
      const [campaign, ...others] = await listCampaigns();

      assert.equal(others.length, 0);
      assert.equal(campaign.name, "Campanha Black");
      assert.equal(campaign.start, "2026-11-03");
      assert.equal(campaign.end, "2026-12-01");
      assert.deepEqual(campaign.goals, TEST_SEGMENT_GOALS);
      assert.equal(campaign.goal, TEST_GOAL);
      assert.equal(campaign.active, true);
      assert.equal(campaign.hasBlackTier, true);
      assert.deepEqual(campaign.sales, { count: 0, total: 0 });
    });

    it("o período cobre as vendas que já estão no banco: os totais das TVs continuam iguais", async () => {
      await Sales.create([sale("antes", seed.vendorA1, "2026-10-20", 700), sale("durante", seed.vendorA1, "2026-11-10", 300)]);

      const [campaign] = await listCampaigns();
      assert.equal(campaign.start, "2026-10-20");
      assert.equal(campaign.end, "2026-12-01");
      assert.deepEqual(campaign.sales, { count: 2, total: 1000 });

      const goal = (await request("GET", "/analytics/goal")).body.data;
      assert.equal(goal.total, 1000);
      assert.equal(goal.goal, TEST_GOAL);
    });

    it("as retiradas de prêmio antigas (sem campanha) passam a ser dela", async () => {
      await PrizeWithdrawal.create({ personId: seed.vendorA1._id, kind: "vendor", quantity: 1, withdrawnAt: "2026-11-05" });

      const [campaign] = await listCampaigns();
      const withdrawals = (await request("GET", "/prizes/withdrawals", tokens.admin)).body.data;
      assert.equal(withdrawals.length, 1);
      assert.equal(String((await PrizeWithdrawal.findOne({})).campaignId), campaign.id);
    });
  });

  describe("quem acessa", () => {
    it("ver: todos os perfis do admin; cadastrar, editar e excluir: master e admin; colaborador e sem login não", async () => {
      assert.equal((await request("GET", "/campaigns", tokens.b2b)).status, 200);
      assert.equal((await request("GET", "/campaigns", tokens.vendorA1)).status, 403);
      assert.equal((await request("GET", "/campaigns")).status, 401);
      assert.equal((await request("POST", "/campaigns", tokens.b2b, march())).status, 403);

      const created = await request("POST", "/campaigns", tokens.admin, march());
      assert.equal(created.status, 201);
      assert.equal(created.body.data.updatedBy, "admin@teste.com");
      assert.equal((await request("PUT", `/campaigns/${created.body.data.id}`, tokens.b2b, march())).status, 403);
      assert.equal((await request("DELETE", `/campaigns/${created.body.data.id}`, tokens.b2b)).status, 403);
    });

    it("dados inválidos → 400", async () => {
      const post = (body) => request("POST", "/campaigns", tokens.admin, body);
      assert.equal((await post(march({ name: "  " }))).status, 400);
      assert.equal((await post(march({ start: "2027-02-30" }))).status, 400);
      assert.match((await post(march({ end: "2027-02-01" }))).body.error, /fim precisa ser igual ou depois do início/);
      assert.equal((await post(march({ goals: { b2b: -1, b2g: 0 } }))).status, 400);
      assert.equal((await post({ ...march(), extra: true })).status, 400);
      assert.equal((await request("PUT", "/campaigns/xyz", tokens.admin, march())).status, 400);
      assert.equal((await request("PUT", "/campaigns/000000000000000000000000", tokens.admin, march())).status, 404);
    });
  });

  describe("campanha ativa e campanha escolhida", () => {
    it("marcar uma como ativa desmarca a outra; as TVs passam a mostrar a nova, com as vendas e a meta dela", async () => {
      const [black] = await listCampaigns();
      await Sales.create([
        sale("black", seed.vendorA1, "2026-11-10", 1000),
        sale("marco-1", seed.vendorA1, "2027-03-05", 400),
        sale("marco-2", seed.vendorB1, "2027-03-31", 100, { segment: "b2g" }),
        sale("abril", seed.vendorA1, "2027-04-01", 9999),
      ]);
      const created = (await request("POST", "/campaigns", tokens.admin, march({ active: true }))).body.data;

      const campaigns = await listCampaigns();
      assert.deepEqual(
        campaigns.map((item) => [item.name, item.active, item.sales.count]),
        [
          ["Março", true, 2],
          ["Campanha Black", false, 1],
        ],
      );
      assert.equal(created.goal, 7000);

      const tv = (await request("GET", "/analytics/goal")).body.data;
      assert.deepEqual(
        { goal: tv.goal, total: tv.total, b2b: tv.segments.b2b, b2g: tv.segments.b2g },
        {
          goal: 7000,
          total: 500,
          b2b: { goal: 5000, total: 400, percent: 8 },
          b2g: { goal: 2000, total: 100, percent: 5 },
        },
      );

      const old = (await request("GET", `/analytics/goal?campaign=${black.id}`, tokens.admin)).body.data;
      assert.equal(old.total, 1000);
      assert.equal(old.goal, TEST_GOAL);
    });

    it("placar, ranking, pontos, forecast e lista de vendas seguem a campanha escolhida", async () => {
      const [black] = await listCampaigns();
      await Sales.create([sale("black", seed.vendorA1, "2026-11-10", 1000), sale("marco", seed.vendorB1, "2027-03-05", 400)]);
      const created = (await request("POST", "/campaigns", tokens.admin, march())).body.data;
      const query = `campaign=${created.id}`;

      const scoreboard = (await request("GET", `/analytics/scoreboard?${query}`)).body.data;
      assert.ok(scoreboard.find((team) => team.teamName === "Time B").total > 0);
      assert.equal(scoreboard.find((team) => team.teamName === "Time A").total, 0);

      const ranking = (await request("GET", `/analytics/ranking?${query}`)).body.data.vendor;
      assert.deepEqual(ranking.map((vendor) => vendor.name), ["Vendor B1"]);

      const people = (await request("GET", `/analytics/people-points?${query}`, tokens.admin)).body.data.people;
      assert.equal(people.find((person) => person.name === "Vendor A1").total, 0);

      const forecast = (await request("GET", `/analytics/forecast?${query}`, tokens.admin)).body.data;
      assert.equal(forecast.campaign.start, "2027-03-01");
      assert.equal(forecast.campaign.end, "2027-03-31");
      assert.equal(forecast.campaign.sold, 400);
      assert.equal(forecast.goal, 7000);
      assert.deepEqual(forecast.period, { type: "campaign", campaignId: created.id, name: "Março" });

      const sales = (await request("GET", `/sales/admin?${query}`, tokens.admin)).body.data;
      assert.deepEqual(sales.data.map((item) => item.rdDealId), ["marco"]);
      assert.deepEqual((await request("GET", "/sales/admin", tokens.admin)).body.data.data.map((item) => item.rdDealId), ["black"]);
      const vendorSales = (await request("GET", `/sales/get/${seed.vendorA1._id}?campaign=${black.id}`, tokens.admin)).body.data;
      assert.deepEqual(vendorSales.data.map((item) => item.rdDealId), ["black"]);

      assert.equal((await request("GET", "/analytics/goal?campaign=000000000000000000000000")).status, 404);
    });

    it("a campanha ativa não pode ser desmarcada nem excluída; com retirada de prêmio também não exclui", async () => {
      const [black] = await listCampaigns();
      const put = await request("PUT", `/campaigns/${black.id}`, tokens.admin, { ...march(), active: false });
      assert.equal(put.status, 400);
      assert.equal((await request("DELETE", `/campaigns/${black.id}`, tokens.admin)).status, 409);

      const created = (await request("POST", "/campaigns", tokens.admin, march())).body.data;
      await request("POST", `/prizes/withdrawals?campaign=${created.id}`, tokens.admin, {
        personId: String(seed.vendorA1._id),
        kind: "vendor",
        quantity: 1,
        withdrawnAt: "2027-03-10",
        confirmOverBalance: true,
      });
      assert.equal((await request("DELETE", `/campaigns/${created.id}`, tokens.admin)).status, 409);

      await PrizeWithdrawal.deleteMany({});
      assert.equal((await request("DELETE", `/campaigns/${created.id}`, tokens.admin)).status, 200);
      assert.equal((await listCampaigns()).length, 1);
    });

    it("editar salva os dados novos; a meta total é a soma dos setores", async () => {
      const created = (await request("POST", "/campaigns", tokens.admin, march())).body.data;
      const edited = await request("PUT", `/campaigns/${created.id}`, tokens.admin, march({ name: "Março forte", goals: { b2b: 100, b2g: 50.5 }, hasBlackTier: true }));

      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.name, "Março forte");
      assert.equal(edited.body.data.goal, 150.5);
      assert.equal(edited.body.data.hasBlackTier, true);
      assert.equal(edited.body.data.active, false);
    });
  });

  describe("prêmios por campanha", () => {
    it("a retirada fica na campanha escolhida e só desconta o saldo dela", async () => {
      const [black] = await listCampaigns();
      const created = (await request("POST", "/campaigns", tokens.admin, march())).body.data;
      const res = await request("POST", `/prizes/withdrawals?campaign=${created.id}`, tokens.admin, {
        personId: String(seed.vendorA1._id),
        kind: "vendor",
        quantity: 2,
        withdrawnAt: "2027-03-10",
        confirmOverBalance: true,
      });
      assert.equal(res.status, 201);

      const withdrawnIn = async (id) =>
        (await request("GET", `/prizes?campaign=${id}`, tokens.admin)).body.data.people.find(
          (person) => String(person.personId) === String(seed.vendorA1._id),
        ).withdrawn;
      assert.equal(await withdrawnIn(created.id), 2);
      assert.equal(await withdrawnIn(black.id), 0);
      assert.equal((await request("GET", `/prizes/withdrawals?campaign=${created.id}`, tokens.admin)).body.data.length, 1);
      assert.equal((await request("GET", "/prizes/withdrawals", tokens.admin)).body.data.length, 0);

      const summary = (await request("GET", `/prizes?campaign=${created.id}`, tokens.admin)).body.data;
      assert.deepEqual(summary.campaign, { id: created.id, name: "Março" });
    });
  });

  describe("Meta black das metas do mês", () => {
    it("vem da campanha marcada com Meta black que começa no mês, com as metas de setor dela", async () => {
      await request("POST", "/campaigns", tokens.admin, march({ hasBlackTier: true }));

      const marchGoals = (await request("GET", "/goals/2027-03", tokens.admin)).body.data.black;
      assert.equal(marchGoals.active, true);
      assert.equal(marchGoals.month, "2027-03");
      assert.equal(marchGoals.campaign.name, "Março");
      assert.equal(marchGoals.total, 7000);
      assert.deepEqual(marchGoals.sectorGoals, { b2b: 5000, b2g: 2000 });

      const november = (await request("GET", "/goals/2026-11", tokens.admin)).body.data.black;
      assert.equal(november.active, true);
      assert.deepEqual(november.sectorGoals, TEST_SEGMENT_GOALS);

      const april = (await request("GET", "/goals/2027-04", tokens.admin)).body.data.black;
      assert.equal(april.active, false);
      assert.deepEqual(april.sectorGoals, { b2b: 0, b2g: 0 });
    });

    it("campanha sem Meta black não cria a faixa", async () => {
      await request("POST", "/campaigns", tokens.admin, march());
      assert.equal((await request("GET", "/goals/2027-03", tokens.admin)).body.data.black.active, false);
    });
  });

  describe("GET /me/goals (Minhas metas)", () => {
    const MONTH = "2026-10";

    const saveOctober = async () => {
      await Vendors.updateOne({ _id: seed.vendorA1._id }, { job: "B2B Venda" });
      await Vendors.updateOne({ _id: seed.vendorA2._id }, { job: "B2B Farmer" });
      const res = await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, {
        levels: [
          { key: "jr", name: "Júnior", type: "sales", goal: 4000, superGoal: 4800 },
          { key: "jr", name: "Júnior", type: "farm", goal: 6000, superGoal: 7200 },
        ],
        people: [
          { vendorId: String(seed.vendorA1._id), level: "jr", goal: 4000, superGoal: 4800 },
          { vendorId: String(seed.vendorA2._id), level: "jr", goal: 6000, superGoal: 7200 },
        ],
      });
      assert.equal(res.status, 200);
    };

    it("o vendedor recebe só a meta dele: faixas, realizado, semanas, previsão e histórico", async () => {
      await saveOctober();
      await Sales.create([
        sale("o1", seed.vendorA1, "2026-10-06", 1500),
        sale("o2", seed.vendorA2, "2026-10-06", 2000, { funnelType: "farm" }),
      ]);

      const { status, body } = await request("GET", `/me/goals?month=${MONTH}`, tokens.vendorA1);
      assert.equal(status, 200);
      const { data } = body;
      assert.equal(data.month, MONTH);
      assert.equal(data.weeks.length, 4);
      assert.equal(data.person.vendorId, String(seed.vendorA1._id));
      assert.equal(data.person.month.realized, 1500);
      assert.equal(data.person.month.tiers.goal, 4000);
      assert.equal(data.person.month.tiers.super, 4800);
      assert.equal(data.person.weeks.length, 4);
      assert.equal(data.person.weeks[0].realized, 1500);
      assert.ok(data.person.forecast.scenarios);
      assert.ok(data.person.cumulative.length > 0);

      const october = data.history.months.find((item) => item.month === MONTH);
      assert.equal(october.people.length, 1);
      assert.equal(october.people[0].vendorId, String(seed.vendorA1._id));
      assert.equal(october.people[0].realized, 1500);
      assert.ok(data.history.months.every((item) => item.people.every((entry) => entry.vendorId === String(seed.vendorA1._id))));
      assert.equal(JSON.stringify(data).includes(String(seed.vendorA2._id)), false);
    });

    it("sem meta no mês ou pessoa de passagem: person null; mês inválido → 400; admin não usa esta rota", async () => {
      await saveOctober();
      assert.equal((await request("GET", `/me/goals?month=${MONTH}`, tokens.vendorB1)).body.data.person, null);
      assert.equal((await request("GET", `/me/goals?month=${MONTH}`, tokens.sdr)).body.data.person, null);
      assert.equal((await request("GET", "/me/goals?month=2026-13", tokens.vendorA1)).status, 400);
      assert.equal((await request("GET", "/me/goals", tokens.admin)).status, 403);
      const current = (await request("GET", "/me/goals", tokens.vendorA1)).body.data.month;
      assert.match(current, /^\d{4}-\d{2}$/);
    });
  });
});
