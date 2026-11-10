const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp, seedBase, clearDatabase, createUserToken, TEST_GOAL } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const User = require("../features/user/model/userModel");
const MonthlyGoal = require("../features/goals/model/monthlyGoalModel");
const { generateAccessToken } = require("../shared/accessTokenService");
const calc = require("../features/goals/service/goalCalculator");

describe("Cálculo das metas mensais (goalCalculator)", () => {
  it("semanas de segunda a domingo que começam no mês; a última pode terminar no mês seguinte", () => {
    assert.deepEqual(
      calc.monthWeeks("2026-11").map((week) => [week.start, week.end]),
      [
        ["2026-11-02", "2026-11-08"],
        ["2026-11-09", "2026-11-15"],
        ["2026-11-16", "2026-11-22"],
        ["2026-11-23", "2026-11-29"],
        ["2026-11-30", "2026-12-06"],
      ],
    );
    assert.equal(calc.monthWeeks("2026-06")[0].start, "2026-06-01");
    assert.equal(calc.monthWeeks("2026-10").length, 4);
  });

  it("divisão pelos pesos e divisão igual sempre fecham no centavo", () => {
    const shares = calc.distributeByWeight(100000, [
      { key: "jr", weight: 1 },
      { key: "pl", weight: 1.5 },
      { key: "sr", weight: 2 },
    ]);
    assert.deepEqual([...shares.values()], [22222, 33333, 44445]);
    assert.equal(
      [...shares.values()].reduce((sum, value) => sum + value, 0),
      100000,
    );
    assert.deepEqual(calc.splitEqually(1000, 3), [334, 333, 333]);
  });

  it("cada parte do setor tem a Meta digitada, a Super = Meta × % e a Black digitada; o setor é a soma", () => {
    const config = { farmGoal: 6000, salesGoal: 4000, superPercent: 120, farmBlack: 9000, salesBlack: 6000 };
    const byType = calc.typeTiers(config, true);

    assert.deepEqual(byType.farm, { goal: 6000, super: 7200, black: 9000 });
    assert.deepEqual(byType.sales, { goal: 4000, super: 4800, black: 6000 });
    assert.deepEqual(calc.segmentTiers(byType), { goal: 10000, super: 12000, black: 15000 });
    assert.deepEqual(calc.typeTiers(config).farm, { goal: 6000, super: 7200, black: 0 });
  });

  it("Super e Black do setor descem para renovação/vendas e para as pessoas na proporção da Meta de cada uma", () => {
    const people = [
      { vendorId: "jr", type: "sales", goal: 1000 },
      { vendorId: "sr", type: "sales", goal: 2000 },
      { vendorId: "fa", type: "farm", goal: 1000 },
    ];
    const byType = { sales: { goal: 3000, super: 4500, black: 9000 }, farm: { goal: 1000, super: 1500, black: 3000 } };
    const byPerson = calc.peopleTiers(people, byType);

    assert.deepEqual(byPerson.get("jr"), { goal: 1000, super: 1500, black: 3000 });
    assert.deepEqual(byPerson.get("sr"), { goal: 2000, super: 3000, black: 6000 });
    assert.deepEqual(byPerson.get("fa"), { goal: 1000, super: 1500, black: 3000 });

    assert.deepEqual(calc.weekTiers({ goal: 1000, super: 1500, black: 3000 }, [400, 600]), [
      { goal: 400, super: 600, black: 1200 },
      { goal: 600, super: 900, black: 1800 },
    ]);
  });

  it("fora do mês da campanha só há Meta e Super; bateu a Super, o que passa é excedente", () => {
    const progress = calc.tierProgress(1300, { goal: 1000, super: 1200, black: 0 });
    assert.deepEqual(progress.available, ["goal", "super"]);
    assert.equal(progress.current, "super");
    assert.equal(progress.excess, 100);
  });

  it("faixas: Meta, depois Super, depois Black; o que passa da Black é excedente", () => {
    const tiers = { goal: 4000, super: 4800, black: 6000 };

    assert.equal(calc.tierProgress(1000, tiers).current, "goal");
    assert.equal(calc.tierProgress(1000, tiers).remaining, 3000);
    assert.equal(calc.tierProgress(4000, tiers).current, "super");
    assert.deepEqual(calc.tierProgress(5000, tiers).reached, ["goal", "super"]);
    assert.equal(calc.tierProgress(5000, tiers).current, "black");

    const beyond = calc.tierProgress(7500, tiers);
    assert.equal(beyond.current, "black");
    assert.equal(beyond.excess, 1500);
    assert.equal(beyond.percent, 125);
  });

  it("ritmo: esperado até hoje, situação, quanto precisa por dia e projeção", () => {
    const pace = calc.paceOf({ realized: 300, goal: 1000, start: "2026-11-02", end: "2026-11-11", today: "2026-11-06" });
    assert.equal(pace.elapsedDays, 5);
    assert.equal(pace.expected, 500);
    assert.equal(pace.status, "behind");
    assert.equal(pace.neededPerDay, 140);
    assert.equal(pace.projection, 600);

    assert.equal(calc.paceOf({ realized: 0, goal: 10, start: "2026-12-01", end: "2026-12-07", today: "2026-11-06" }).status, "upcoming");
    assert.equal(calc.paceOf({ realized: 10, goal: 10, start: "2026-11-02", end: "2026-11-08", today: "2026-11-03" }).status, "done");
  });
});

describe("Metas mensais (/goals)", () => {
  let testApp;
  let seed;
  let tokens;

  const MONTH = "2026-10";
  const WEEKS = 4;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    await Promise.all([User.deleteMany({}), MonthlyGoal.deleteMany({})]);
    seed = await seedBase();
    await Vendors.updateOne({ _id: seed.vendorA1._id }, { job: "B2B Venda" });
    await Vendors.updateOne({ _id: seed.vendorA2._id }, { job: "B2B Farmer" });
    await Vendors.updateOne({ _id: seed.vendorB1._id }, { job: "B2G Venda" });
    await Vendors.updateOne({ _id: seed.vendorC1._id }, { job: "B2G Farmer" });

    await User.collection.insertOne({ email: "vend@teste.com", passwordHash: "x", role: "vendor", vendorId: seed.vendorA1._id });
    const vendorUser = await User.findOne({ email: "vend@teste.com" });

    tokens = {
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      b2g: await createUserToken("b2g"),
      vendor: generateAccessToken({ id: vendorUser._id, email: vendorUser.email }),
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

  // B2B: meta 10.000 e super 12.000; 60% renovação (6.000 para o Farmer A2) e 40% vendas (4.000 para o A1)
  const validB2b = () => ({
    farmGoal: 6000,
    salesGoal: 4000,
    superPercent: 120,
    levels: [
      { key: "jr", name: "Júnior", weight: 1 },
      { key: "sr", name: "Sênior", weight: 2 },
    ],
    people: [
      { vendorId: String(seed.vendorA1._id), level: "jr", goal: 4000, weeks: [1000, 1000, 1000, 1000] },
      { vendorId: String(seed.vendorA2._id), level: "sr", goal: 6000, weeks: [1500, 1500, 1500, 1500] },
    ],
  });

  const sale = (rdDealId, vendor, funnelType, isoDate, value, extra = {}) => ({
    rdDealId,
    vendorId: vendor._id,
    value,
    rdUpdatedAt: new Date(),
    segment: "b2b",
    funnelType,
    realizedAt: new Date(isoDate),
    dealStatus: "ativa",
    ...extra,
  });

  describe("quem acessa", () => {
    it("só master e admin; b2b, b2g e vendedor → 403; sem login → 401", async () => {
      assert.equal((await request("GET", `/goals/${MONTH}`, tokens.admin)).status, 200);
      for (const token of [tokens.b2b, tokens.b2g, tokens.vendor]) {
        assert.equal((await request("GET", `/goals/${MONTH}`, token)).status, 403);
        assert.equal((await request("GET", `/goals/${MONTH}/progress`, token)).status, 403);
        assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, token, validB2b())).status, 403);
      }
      assert.equal((await request("GET", `/goals/${MONTH}`, undefined)).status, 401);
    });

    it("mês ou setor inválido → 400", async () => {
      assert.equal((await request("GET", "/goals/2026-13", tokens.admin)).status, 400);
      assert.equal((await request("PUT", `/goals/${MONTH}/xyz`, tokens.admin, validB2b())).status, 400);
    });
  });

  describe("cadastro do mês", () => {
    it("mês sem meta: semanas, vendedores de cada setor pelo cargo e nada salvo", async () => {
      const { body } = await request("GET", `/goals/${MONTH}`, tokens.admin);
      const { data } = body;

      assert.equal(data.weeks.length, WEEKS);
      assert.equal(data.segments.b2b.config, null);
      assert.equal(data.segments.b2b.previous, null);
      assert.deepEqual(
        data.segments.b2b.vendors.map((vendor) => [vendor.name, vendor.type]),
        [
          ["Vendor A1", "sales"],
          ["Vendor A2", "farm"],
        ],
      );
      assert.deepEqual(
        data.segments.b2g.vendors.map((vendor) => vendor.name),
        ["Vendor B1", "Vendor C1"],
      );
    });

    it("salva quando tudo fecha; o mês seguinte vem com este para copiar", async () => {
      const saved = await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.updatedBy, "admin@teste.com");

      const month = (await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data;
      assert.equal(month.segments.b2b.config.farmGoal, 6000);
      assert.deepEqual(month.segments.b2b.config.people[1].weeks, [1500, 1500, 1500, 1500]);
      assert.equal(month.segments.b2g.config, null);

      const next = (await request("GET", "/goals/2026-11", tokens.admin)).body.data;
      assert.equal(next.segments.b2b.config, null);
      assert.equal(next.segments.b2b.previous.month, MONTH);
      assert.equal(next.weeks.length, 5);
      assert.equal(next.black.total, TEST_GOAL);
    });

    it("salvar de novo substitui o mês, sem mexer nos outros meses", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      assert.equal((await request("PUT", "/goals/2026-12/b2b", tokens.admin, validB2b())).status, 200);
      const changed = { ...validB2b(), superPercent: 130 };
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, changed)).status, 200);

      assert.equal(await MonthlyGoal.countDocuments({}), 2);
      assert.equal((await MonthlyGoal.findOne({ month: MONTH })).superPercent, 130);
      assert.equal((await MonthlyGoal.findOne({ month: "2026-12" })).superPercent, 120);
    });

    it("recusa com a mensagem do que não fecha", async () => {
      const cases = [
        [{ people: [{ ...validB2b().people[0], weeks: [1000, 1000, 1000, 900] }, validB2b().people[1]] }, /Semanas de Vendor A1/],
        [{ people: [{ ...validB2b().people[0], goal: 3000, weeks: [750, 750, 750, 750] }, validB2b().people[1]] }, /Vendas: distribuído/],
        [{ farmGoal: 5000 }, /Renovação: distribuído/],
        [{ people: [...validB2b().people, { vendorId: String(seed.vendorB1._id), level: "jr", goal: 0, weeks: [0, 0, 0, 0] }] }, /não é do setor B2B/],
        [{ people: [{ ...validB2b().people[0], level: "xx" }, validB2b().people[1]] }, /nível válido/],
        [{ people: [{ ...validB2b().people[0], weeks: [2000, 2000] }, validB2b().people[1]] }, /4 semanas/],
        [{ superPercent: 100 }, /Super meta precisa ser maior que 100% da Meta/],
        [{ farmGoal: 0, salesGoal: 0, people: [] }, /meta do setor precisa ser maior que zero/],
        [{ levels: [] }, /pelo menos um nível/],
        [{ extra: true }, /./],
      ];
      for (const [change, message] of cases) {
        const res = await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, { ...validB2b(), ...change });
        assert.equal(res.status, 400, JSON.stringify(change));
        assert.match(res.body.error, message);
      }
      assert.equal(await MonthlyGoal.countDocuments({}), 0);
    });

    it("excluir o mês de um setor; excluir de novo → 404", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      assert.equal((await request("DELETE", `/goals/${MONTH}/b2b`, tokens.admin)).status, 200);
      assert.equal((await request("DELETE", `/goals/${MONTH}/b2b`, tokens.admin)).status, 404);
    });
  });

  describe("Meta black no mês da campanha (2026-11)", () => {
    // B2B: Meta de renovação 1.800 (A2) e de vendas 1.200 (A1); Super 125%.
    // Black do setor no .env de teste: 6.000 → 3.000 de Farmer e o resto (3.000) de Venda
    const novemberB2b = (changes = {}) => ({
      farmGoal: 1800,
      salesGoal: 1200,
      superPercent: 125,
      farmBlack: 3000,
      levels: [{ key: "jr", name: "Júnior", weight: 1 }],
      people: [
        { vendorId: String(seed.vendorA1._id), level: "jr", goal: 1200, weeks: [240, 240, 240, 240, 240] },
        { vendorId: String(seed.vendorA2._id), level: "jr", goal: 1800, weeks: [360, 360, 360, 360, 360] },
      ],
      ...changes,
    });

    it("o mês da campanha traz a Meta black de cada setor do .env", async () => {
      const month = (await request("GET", "/goals/2026-11", tokens.admin)).body.data;
      assert.equal(month.black.active, true);
      assert.deepEqual(month.black.sectorGoals, { b2b: 6000, b2g: 3000 });
      assert.equal((await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data.black.active, false);
    });

    it("o gestor diz quanto da Black do setor é de Farmer; Venda fica com o resto; cada uma maior que a Super", async () => {
      const put = (body) => request("PUT", "/goals/2026-11/b2b", tokens.admin, body);

      assert.match((await put(novemberB2b({ farmBlack: null }))).body.error, /Renovação: a Meta black precisa ser maior/);
      assert.match(
        (await put(novemberB2b({ farmBlack: 5000 }))).body.error,
        /Vendas: a Meta black precisa ser maior que a Super meta \(R\$\s1\.500,00\)/,
      );
      assert.match((await put(novemberB2b({ farmBlack: 7000 }))).body.error, /passa da Meta black do setor/);
      assert.equal((await put(novemberB2b({ salesBlack: 1 }))).status, 400);
      assert.equal((await put(novemberB2b())).status, 200);

      const saved = await MonthlyGoal.findOne({ month: "2026-11" });
      assert.deepEqual([saved.farmBlack, saved.salesBlack], [3000, 3000]);
    });

    it("fora do mês da campanha a Meta black não é gravada", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, { ...validB2b(), farmBlack: 99999 });
      const saved = await MonthlyGoal.findOne({ month: MONTH });
      assert.deepEqual([saved.farmBlack, saved.salesBlack], [null, null]);
    });

    it("as faixas de cada parte descem para as pessoas e para as semanas", async () => {
      await request("PUT", "/goals/2026-11/b2b", tokens.admin, novemberB2b());

      const { data } = (await request("GET", "/goals/2026-11/progress", tokens.admin)).body;
      const [b2b] = data.segments;
      const a1 = data.people.find((person) => person.name === "Vendor A1");
      const a2 = data.people.find((person) => person.name === "Vendor A2");

      assert.equal(data.black.active, true);
      assert.deepEqual(b2b.month.tiers, { goal: 3000, super: 3750, black: 6000 });
      assert.deepEqual(b2b.parts.farm.tiers, { goal: 1800, super: 2250, black: 3000 });
      assert.deepEqual(b2b.parts.sales.tiers, { goal: 1200, super: 1500, black: 3000 });
      assert.deepEqual(a1.month.tiers, { goal: 1200, super: 1500, black: 3000 });
      assert.deepEqual(a2.month.tiers, { goal: 1800, super: 2250, black: 3000 });
      assert.deepEqual(a1.weeks[0].tiers, { goal: 240, super: 300, black: 600 });
      assert.deepEqual(a1.month.available, ["goal", "super", "black"]);
    });
  });

  describe("progresso do mês", () => {
    it("mês sem meta: tudo vazio", async () => {
      const { body } = await request("GET", `/goals/${MONTH}/progress`, tokens.admin);
      assert.deepEqual(body.data.people, []);
      assert.equal(body.data.summary.people, 0);
    });

    it("conta só as vendas ativas do tipo do cargo dentro das semanas do mês, com as faixas", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      await Sales.create([
        sale("s1", seed.vendorA1, "sales", "2026-10-06T15:00:00Z", 3000),
        sale("s2", seed.vendorA1, "sales", "2026-10-13T15:00:00Z", 2000),
        sale("s3", seed.vendorA1, "farm", "2026-10-13T15:00:00Z", 9999),
        sale("s4", seed.vendorA1, "sales", "2026-10-14T15:00:00Z", 9999, { dealStatus: "cancelada" }),
        sale("s5", seed.vendorA1, "sales", "2026-10-04T15:00:00Z", 9999),
        sale("s6", seed.vendorA1, "sales", "2026-11-01T23:00:00Z", 500),
        sale("s7", seed.vendorA2, "farm", "2026-10-20T15:00:00Z", 1000),
      ]);

      const { status, body } = await request("GET", `/goals/${MONTH}/progress`, tokens.admin);
      const { data } = body;
      assert.equal(status, 200);

      const a1 = data.people.find((person) => person.name === "Vendor A1");
      assert.equal(a1.month.realized, 5500);
      assert.deepEqual(a1.month.tiers, { goal: 4000, super: 4800, black: 0 });
      assert.deepEqual(a1.month.reached, ["goal", "super"]);
      assert.equal(a1.month.current, "super");
      assert.equal(a1.month.excess, 700);
      assert.equal(a1.levelName, "Júnior");
      assert.deepEqual(
        a1.weeks.map((week) => week.realized),
        [3000, 2000, 0, 500],
      );
      assert.equal(a1.weeks[0].current, "super");
      assert.equal(a1.weeks[0].tiers.super, 1200);
      assert.equal(a1.weeks[0].excess, 1800);
      assert.equal(a1.weeks[2].current, "goal");
      assert.equal(a1.cumulative.at(-1), 5500);

      const a2 = data.people.find((person) => person.name === "Vendor A2");
      assert.equal(a2.month.realized, 1000);
      assert.equal(a2.month.current, "goal");
      assert.equal(a2.month.pace.status, "behind");

      const [b2b] = data.segments;
      assert.equal(b2b.segment, "b2b");
      assert.equal(b2b.month.realized, 6500);
      assert.deepEqual(b2b.month.tiers, { goal: 10000, super: 12000, black: 0 });
      assert.equal(data.black.active, false);
      assert.deepEqual([b2b.parts.farm.goal, b2b.parts.farm.realized], [6000, 1000]);
      assert.deepEqual([b2b.parts.sales.goal, b2b.parts.sales.realized], [4000, 5500]);
      assert.deepEqual(b2b.parts.sales.tiers, { goal: 4000, super: 4800, black: 0 });
      assert.equal(b2b.parts.sales.current, "super");
      assert.equal(b2b.weeks[0].tiers.goal, 2500);

      const teamA = data.teams.find((team) => team.teamName === "Time A");
      assert.equal(teamA.members, 2);
      assert.equal(teamA.month.realized, 6500);
      assert.equal(teamA.month.tiers.goal, 10000);

      assert.deepEqual(data.people.map((person) => person.name), ["Vendor A1", "Vendor A2"]);
      assert.deepEqual(data.summary, { people: 2, reachedGoal: 1, reachedSuper: 1, reachedBlack: 0, onPace: 1, behind: 1 });
    });
  });
});
