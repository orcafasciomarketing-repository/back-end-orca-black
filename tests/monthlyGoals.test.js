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

  it("ritmo em dias úteis (segunda a sexta): esperado até hoje, situação, quanto precisa por dia (hoje incluso) e projeção", () => {
    // 02/11 (feriado) a 11/11 (quarta): 7 dias úteis (03 a 06, 09 a 11); hoje sexta 06/11 = 4 passados;
    // faltam 06 (hoje), 09, 10 e 11
    const pace = calc.paceOf({ realized: 300, goal: 1000, start: "2026-11-02", end: "2026-11-11", today: "2026-11-06" });
    assert.equal(pace.totalDays, 7);
    assert.equal(pace.elapsedDays, 4);
    assert.equal(pace.expected, 571.43);
    assert.equal(pace.status, "behind");
    assert.equal(pace.daysToGo, 4);
    assert.equal(pace.neededPerDay, 175);
    assert.equal(pace.projection, 525);
    assert.equal(calc.paceOf({ realized: 0, goal: 10, start: "2026-11-02", end: "2026-11-08", today: "2026-11-09" }).daysToGo, 0);

    assert.equal(calc.paceOf({ realized: 0, goal: 10, start: "2026-12-01", end: "2026-12-07", today: "2026-11-06" }).status, "upcoming");
    assert.equal(calc.paceOf({ realized: 10, goal: 10, start: "2026-11-02", end: "2026-11-08", today: "2026-11-03" }).status, "done");
  });
});

describe("Forecast do mês da meta (goalCalculator.monthForecast)", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"];

  it("mesmo modelo do forecast da campanha, em dias úteis de segunda a sexta: feriado vai para o dia útil seguinte do início, ritmo ponderado e cenários", () => {
    const forecast = calc.monthForecast({
      days,
      dailyCents: [100000, 100000, 200000, 0, 0, 0, 0],
      tiers: { goal: 5000, super: 6000, black: 0 },
      today: "2026-11-04",
    });

    // 02/11 é feriado e 07 e 08 são fim de semana: dias úteis 03, 04, 05 e 06; hoje 04 → 2 passados, 2 restantes
    assert.deepEqual(forecast.productiveDays, { elapsed: 2, remaining: 2 });
    assert.equal(forecast.pace.current, 2000);
    assert.deepEqual(forecast.scenarios, { pessimistic: 7200, realistic: 8000, optimistic: 8800 });
    assert.deepEqual(Object.keys(forecast.tiers), ["goal", "super"]);
    assert.deepEqual(forecast.tiers.super, {
      target: 6000,
      requiredPace: 1000,
      paceCoverage: 200,
      gap: -2000,
      probability: 100,
    });
    assert.deepEqual(forecast.trajectory.realistic, [null, null, 4000, 6000, 8000, 8000, 8000]);
  });

  it("chance de cada faixa pela normal; mês encerrado: 100 se bateu, 0 se não", () => {
    const forecast = calc.monthForecast({
      days,
      dailyCents: [0, 100000, 300000, 0, 0, 0, 0],
      tiers: { goal: 7000, super: 9000, black: 12000 },
      today: "2026-11-04",
    });
    assert.ok(forecast.tiers.goal.probability > 50 && forecast.tiers.goal.probability < 100);
    assert.ok(forecast.tiers.super.probability < forecast.tiers.goal.probability);
    assert.ok(forecast.tiers.black.probability < forecast.tiers.super.probability);

    const closed = calc.monthForecast({
      days,
      dailyCents: [0, 100000, 300000, 0, 0, 0, 0],
      tiers: { goal: 4000, super: 5000, black: 0 },
      today: "2026-11-20",
    });
    assert.deepEqual([closed.tiers.goal.probability, closed.tiers.super.probability], [100, 0]);
    assert.ok(closed.trajectory.realistic.every((value) => value === null));
  });

  it("o total soma os forecasts dos setores; com o mesmo modelo dá o mesmo que calcular tudo junto", () => {
    const b2b = [0, 100000, 300000, 0, 0, 0, 0];
    const b2g = [0, 50000, 20000, 0, 0, 0, 0];
    const tiers = { goal: 9000, super: 12000, black: 0 };
    const today = "2026-11-04";
    const total = b2b.map((value, index) => value + b2g[index]);
    const parts = [
      calc.monthForecast({ days, dailyCents: b2b, tiers, today }),
      calc.monthForecast({ days, dailyCents: b2g, tiers, today }),
    ];
    const combined = calc.combineMonthForecasts({ days, dailyCents: total, tiers, today, parts });
    const together = calc.monthForecast({ days, dailyCents: total, tiers, today });

    assert.equal(combined.model.key, "total");
    assert.deepEqual(combined.scenarios, together.scenarios);
    assert.deepEqual(combined.tiers, together.tiers);
    assert.deepEqual(combined.trajectory, together.trajectory);
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

  // Modelo de níveis (planilha do comercial): Meta e Super em R$ por nível, separados por Farmer e Venda.
  // B2B: A1 (Venda, Júnior) 4.000 / Super 4.800 e A2 (Farmer, Sênior) 6.000 / Super 7.200 → setor 10.000 / 12.000
  const levels = () => [
    { key: "jr", name: "Júnior", type: "sales", goal: 4000, superGoal: 4800 },
    { key: "sr", name: "Sênior", type: "farm", goal: 6000, superGoal: 7200 },
  ];
  const validB2b = () => ({
    levels: levels(),
    tickets: { farm: 2000, sales: 1000 },
    conversion: { farm: null, sales: 30 },
    people: [
      { vendorId: String(seed.vendorA1._id), level: "jr", goal: 4000, superGoal: 4800 },
      { vendorId: String(seed.vendorA2._id), level: "sr", goal: 6000, superGoal: 7200 },
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
      const config = month.segments.b2b.config;
      assert.equal(config.model, "levels");
      assert.deepEqual([config.farmGoal, config.salesGoal, config.farmSuper, config.salesSuper], [6000, 4000, 7200, 4800]);
      assert.equal(config.superPercent, null);
      assert.deepEqual(config.tickets, { farm: 2000, sales: 1000 });
      assert.deepEqual(config.conversion, { farm: null, sales: 30 });
      assert.deepEqual(config.levels[0], { key: "jr", name: "Júnior", type: "sales", goal: 4000, superGoal: 4800, weight: null });
      assert.deepEqual(config.people[1], { vendorId: String(seed.vendorA2._id), type: "farm", level: "sr", goal: 6000, superGoal: 7200, blackGoal: null, weeks: [] });
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
      const changed = validB2b();
      changed.people[0] = { ...changed.people[0], goal: 5000, superGoal: 5500 };
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, changed)).status, 200);

      assert.equal(await MonthlyGoal.countDocuments({}), 2);
      assert.equal((await MonthlyGoal.findOne({ month: MONTH })).salesGoal, 5000);
      assert.equal((await MonthlyGoal.findOne({ month: "2026-12" })).salesGoal, 4000);
    });

    it("recusa com a mensagem do que não fecha", async () => {
      const [a1, a2] = validB2b().people;
      const cases = [
        [{ people: [{ ...a1, superGoal: 3000 }, a2] }, /Super meta de Vendor A1 não pode ser menor que a Meta do mês/],
        [{ people: [...validB2b().people, { vendorId: String(seed.vendorB1._id), level: "jr", goal: 0, superGoal: 0 }] }, /não é do setor B2B/],
        [{ people: [{ ...a1, level: "xx" }, a2] }, /nível de Vendas válido para Vendor A1/],
        [{ people: [{ ...a1, level: "sr" }, a2] }, /nível de Vendas válido para Vendor A1/],
        [{ people: [a1, a1] }, /aparece mais de uma vez/],
        [{ levels: [...levels(), { ...levels()[0] }] }, /níveis repetidos/],
        [{ levels: [{ ...levels()[0], superGoal: 100 }, levels()[1]] }, /Vendas · Júnior: a Super meta não pode ser menor que a Meta/],
        [{ levels: [{ ...levels()[0], anticipation: 10 }, levels()[1]] }, /./],
        [{ people: [] }, /meta do setor precisa ser maior que zero/],
        [{ levels: [] }, /pelo menos um nível/],
        [{ superPercent: 120 }, /./],
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
    // B2B: Venda (A1) 1.200 / Super 1.500 e Farmer (A2) 1.800 / Super 2.250.
    // Black do setor (meta B2B da campanha Black dos testes): 6.000 → 3.000 de Farmer e o resto (3.000) de Venda
    const novemberB2b = (changes = {}) => ({
      levels: [
        { key: "jr", name: "Júnior", type: "sales", goal: 1200, superGoal: 1500 },
        { key: "jr", name: "Júnior", type: "farm", goal: 1800, superGoal: 2250 },
      ],
      farmBlack: 3000,
      salesBlack: 3000,
      people: [
        { vendorId: String(seed.vendorA1._id), level: "jr", goal: 1200, superGoal: 1500 },
        { vendorId: String(seed.vendorA2._id), level: "jr", goal: 1800, superGoal: 2250 },
      ],
      ...changes,
    });

    it("o mês da campanha traz a Meta black de cada setor do .env", async () => {
      const month = (await request("GET", "/goals/2026-11", tokens.admin)).body.data;
      assert.equal(month.black.active, true);
      assert.deepEqual(month.black.sectorGoals, { b2b: 6000, b2g: 3000 });
      assert.equal((await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data.black.active, false);
    });

    it("o gestor digita a Black de Farmer e a de Venda; cada uma pode ser igual à Super, mas não menor", async () => {
      const put = (body) => request("PUT", "/goals/2026-11/b2b", tokens.admin, body);

      assert.match((await put(novemberB2b({ farmBlack: null }))).body.error, /Informe a Meta black de Renovação/);
      assert.match((await put(novemberB2b({ salesBlack: undefined }))).body.error, /Informe a Meta black de Vendas/);
      assert.match(
        (await put(novemberB2b({ salesBlack: 1499.99 }))).body.error,
        /Vendas: a Meta black não pode ser menor que a Super meta \(R\$\s1\.500,00\)/,
      );
      // Black de Venda igual à Super de Venda (como no B2B): pode
      assert.equal((await put(novemberB2b({ salesBlack: 1500 }))).status, 200);
      // Não precisa bater com a meta do setor na campanha (6.000)
      assert.equal((await put(novemberB2b({ farmBlack: 9000, salesBlack: 4000 }))).status, 200);

      const saved = await MonthlyGoal.findOne({ month: "2026-11" });
      assert.deepEqual([saved.farmBlack, saved.salesBlack, saved.blackTyped], [9000, 4000, true]);
      const { data } = (await request("GET", "/goals/2026-11/progress", tokens.admin)).body;
      assert.deepEqual(data.segments[0].month.tiers.black, 13000);
    });

    it("a Black de cada vendedor começa na proporção da Super dele: Black da parte = Super da parte dá Black = Super", async () => {
      await Vendors.updateOne({ _id: seed.vendorB1._id }, { job: "B2B Venda" });
      const body = novemberB2b({
        salesBlack: 1500,
        people: [
          { vendorId: String(seed.vendorA1._id), level: "jr", goal: 800, superGoal: 1100 },
          { vendorId: String(seed.vendorB1._id), level: "jr", goal: 400, superGoal: 400 },
          novemberB2b().people[1],
        ],
      });
      const saved = await request("PUT", "/goals/2026-11/b2b", tokens.admin, body);

      assert.equal(saved.status, 200);
      assert.deepEqual(
        saved.body.data.people.map(({ superGoal, blackGoal }) => [superGoal, blackGoal]),
        [
          [1100, 1100],
          [400, 400],
          [2250, 3000],
        ],
      );
    });

    it("mês salvo antes (só a Black de Farmer digitada): Venda continua = meta do setor na campanha − Farmer", async () => {
      await MonthlyGoal.collection.insertOne({
        month: "2026-11",
        segment: "b2b",
        farmGoal: 1800,
        salesGoal: 1200,
        superPercent: 125,
        farmBlack: 3000,
        salesBlack: 9999,
        levels: [{ key: "jr", name: "Júnior", weight: 1 }],
        people: [
          { vendorId: seed.vendorA1._id, type: "sales", level: "jr", goal: 1200, superGoal: 1500, blackGoal: null, weeks: [] },
          { vendorId: seed.vendorA2._id, type: "farm", level: "jr", goal: 1800, superGoal: 2250, blackGoal: null, weeks: [] },
        ],
      });

      const { data } = (await request("GET", "/goals/2026-11/progress", tokens.admin)).body;
      assert.deepEqual(data.segments[0].parts.sales.tiers, { goal: 1200, super: 1500, black: 3000 });
      const config = (await request("GET", "/goals/2026-11", tokens.admin)).body.data.segments.b2b.config;
      assert.equal(config.blackTyped, false);
    });

    it("fora do mês da campanha a Meta black não é gravada", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, { ...validB2b(), farmBlack: 99999 });
      const saved = await MonthlyGoal.findOne({ month: MONTH });
      assert.deepEqual([saved.farmBlack, saved.salesBlack], [null, null]);
    });

    it("as faixas de cada parte descem para as pessoas; a semana é o que falta ÷ semanas que faltam", async () => {
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
      assert.equal(a1.weeks.length, 5);
      assert.deepEqual(a1.month.available, ["goal", "super", "black"]);
    });
    it("Super e Black de cada vendedor podem ser editadas; cada parte precisa fechar e a ordem das faixas vale por pessoa", async () => {
      await Vendors.updateOne({ _id: seed.vendorB1._id }, { job: "B2B Venda" });
      const put = (body) => request("PUT", "/goals/2026-11/b2b", tokens.admin, body);
      const salesPeople = (a1, b1) => [
        { vendorId: String(seed.vendorA1._id), level: "jr", goal: 800, superGoal: 1000, ...a1 },
        { vendorId: String(seed.vendorB1._id), level: "jr", goal: 400, superGoal: 500, ...b1 },
        novemberB2b().people[1],
      ];
      const body = (a1, b1) => novemberB2b({ people: salesPeople(a1, b1) });

      assert.match(
        (await put(body({ superGoal: 1200 }, { superGoal: 300 }))).body.error,
        /Super meta de Vendor B1 não pode ser menor que a Meta do mês \(R\$\s400,00\)/,
      );
      assert.match(
        (await put(body({ superGoal: 1000, blackGoal: 900 }, { superGoal: 500, blackGoal: 2100 }))).body.error,
        /Meta black de Vendor A1 não pode ser menor que a Super meta/,
      );
      assert.match(
        (await put(body({ superGoal: 1000, blackGoal: 2000 }, { superGoal: 500, blackGoal: 500 }))).body.error,
        /Meta black Vendas: distribuído R\$\s2\.500,00 de R\$\s3\.000,00/,
      );

      const saved = await put(body({ superGoal: 1000, blackGoal: 2000 }, { superGoal: 500, blackGoal: 1000 }));
      assert.equal(saved.status, 200);
      assert.deepEqual(
        saved.body.data.people.map(({ superGoal, blackGoal }) => [superGoal, blackGoal]),
        [
          [1000, 2000],
          [500, 1000],
          [2250, 3000],
        ],
      );

      const { data } = (await request("GET", "/goals/2026-11/progress", tokens.admin)).body;
      const tiersOf = (name) => data.people.find((person) => person.name === name).month.tiers;
      assert.deepEqual(tiersOf("Vendor A1"), { goal: 800, super: 1000, black: 2000 });
      assert.deepEqual(tiersOf("Vendor B1"), { goal: 400, super: 500, black: 1000 });
      assert.deepEqual(data.people.find((person) => person.name === "Vendor A1").weeks[0].tiers, {
        goal: 160,
        super: 200,
        black: 400,
      });
      assert.deepEqual(data.segments[0].parts.sales.tiers, { goal: 1200, super: 1500, black: 3000 });
    });

    it("fora do mês da campanha a Super de cada vendedor é gravada e a Black não", async () => {
      const people = validB2b().people.map((person) => ({ ...person, blackGoal: 99999 }));
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, { ...validB2b(), people })).status, 200);
      const saved = await MonthlyGoal.findOne({ month: MONTH });
      assert.deepEqual(
        saved.people.map(({ superGoal, blackGoal }) => [superGoal, blackGoal]),
        [
          [4800, null],
          [7200, null],
        ],
      );
      assert.deepEqual([saved.farmBlack, saved.salesBlack], [null, null]);
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
      // Semana recalculada: a 2ª começa com 3.000 vendidos → (4.000 − 3.000) ÷ 3 semanas e (4.800 − 3.000) ÷ 3
      assert.deepEqual(a1.weeks[1].tiers, { goal: 333.33, super: 600, black: 0 });
      assert.deepEqual(a1.weeks[2].tiers, { goal: 0, super: 0, black: 0 });
      assert.equal(a1.ticket, 1000);
      assert.equal(a1.month.salesNeeded, 0);
      assert.equal(a1.conversion, 30);
      assert.equal(a1.month.leadsNeeded, 0);
      assert.equal(a1.cumulative.at(-1), 5500);

      const a2 = data.people.find((person) => person.name === "Vendor A2");
      assert.equal(a2.month.realized, 1000);
      assert.equal(a2.month.current, "goal");
      assert.equal(a2.month.pace.status, "behind");
      assert.equal(a2.month.salesNeeded, 3);
      assert.equal(a2.month.leadsNeeded, undefined);
      assert.equal(a2.month.pace.daysToGo, 0);

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

      assert.deepEqual(data.total.month.tiers, b2b.month.tiers);
      assert.equal(data.total.month.realized, 6500);
      assert.deepEqual(data.total.parts.sales.tiers, b2b.parts.sales.tiers);
      assert.equal(data.total.cumulative.at(-1), 6500);
      assert.equal(data.total.weeks[0].tiers.goal, 2500);
      assert.deepEqual(Object.keys(data.total.forecast.tiers), ["goal", "super"]);
      assert.deepEqual([a1.forecast.tiers.goal.probability, a1.forecast.tiers.super.probability], [100, 100]);
      assert.equal(a2.forecast.tiers.goal.probability, 0);
      assert.equal(b2b.forecast.tiers.goal.target, 10000);
      assert.equal(b2b.forecast.model.key, "b2b");
      assert.equal(a1.forecast.model.key, "b2b");
      assert.equal(data.total.forecast.model.key, "total");
    });
  });

  describe("vendas e leads que faltam", () => {
    it("pelo ticket médio e pela taxa de conversão do tipo (planilha de vendas: leads = falta ÷ (ticket × conversão))", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      await Sales.create(sale("l1", seed.vendorA1, "sales", "2026-10-06T15:00:00Z", 1000));

      const { data } = (await request("GET", `/goals/${MONTH}/progress`, tokens.admin)).body;
      const a1 = data.people.find((person) => person.name === "Vendor A1");
      // Falta 3.000 da Meta: 3 vendas de R$ 1.000 e 10 leads (3.000 ÷ 300)
      assert.deepEqual([a1.month.remaining, a1.month.salesNeeded, a1.month.leadsNeeded], [3000, 3, 10]);
      // Semana 2: (4.000 − 1.000) ÷ 3 = 1.000 → 1 venda e 4 leads (1.000 ÷ 300, para cima)
      assert.deepEqual([a1.weeks[1].remaining, a1.weeks[1].salesNeeded, a1.weeks[1].leadsNeeded], [1000, 1, 4]);

      const a2 = data.people.find((person) => person.name === "Vendor A2");
      assert.deepEqual([a2.month.salesNeeded, a2.month.leadsNeeded], [3, undefined]);
    });

    it("conversão fora de 0 a 100 → 400", async () => {
      const res = await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, { ...validB2b(), conversion: { farm: null, sales: 120 } });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Conversão de Venda inválida/);
    });
  });

  describe("mês salvo no modelo antigo (pesos e % da Super)", () => {
    it("continua com a meta e a Super salvas de cada pessoa; a semana passa a ser recalculada", async () => {
      await MonthlyGoal.collection.insertOne({
        month: MONTH,
        segment: "b2b",
        farmGoal: 6000,
        salesGoal: 4000,
        superPercent: 120,
        farmBlack: null,
        salesBlack: null,
        levels: [{ key: "jr", name: "Júnior", weight: 1 }],
        people: [
          { vendorId: seed.vendorA1._id, type: "sales", level: "jr", goal: 4000, superGoal: 4800, blackGoal: null, weeks: [1000, 1000, 1000, 1000] },
          { vendorId: seed.vendorA2._id, type: "farm", level: "jr", goal: 6000, superGoal: 7200, blackGoal: null, weeks: [1500, 1500, 1500, 1500] },
        ],
      });
      await Sales.create(sale("v1", seed.vendorA1, "sales", "2026-10-06T15:00:00Z", 1000));

      const config = (await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data.segments.b2b.config;
      assert.equal(config.model, "weights");
      assert.equal(config.superPercent, 120);
      assert.equal(config.levels[0].weight, 1);

      const { data } = (await request("GET", `/goals/${MONTH}/progress`, tokens.admin)).body;
      const a1 = data.people.find((person) => person.name === "Vendor A1");
      assert.deepEqual(a1.month.tiers, { goal: 4000, super: 4800, black: 0 });
      assert.deepEqual(data.segments[0].month.tiers, { goal: 10000, super: 12000, black: 0 });
      assert.deepEqual(a1.weeks[1].tiers, { goal: 1000, super: 1266.67, black: 0 });
      assert.equal(a1.month.salesNeeded, undefined);
    });
  });

  describe("histórico mês a mês", () => {
    it("realizado e faixas de cada mês; mês sem meta conta os vendedores do setor pelo cargo, sem faixas", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.admin, validB2b());
      await Sales.create([
        sale("h1", seed.vendorA1, "sales", "2026-10-06T15:00:00Z", 3000),
        sale("h2", seed.vendorA1, "sales", "2026-09-15T15:00:00Z", 700),
        sale("h3", seed.vendorA1, "farm", "2026-09-15T15:00:00Z", 9999),
        sale("h4", seed.vendorA2, "farm", "2026-09-16T15:00:00Z", 300),
        sale("h5", seed.vendorB1, "sales", "2026-09-17T15:00:00Z", 50),
      ]);

      const { status, body } = await request("GET", `/goals/${MONTH}/history?months=3`, tokens.admin);
      assert.equal(status, 200);
      const { months } = body.data;
      assert.deepEqual(months.map((item) => item.month), ["2026-08", "2026-09", MONTH]);

      const [, september, october] = months;
      assert.deepEqual(october.total, { realized: 3000, tiers: { goal: 10000, super: 12000, black: 0 } });
      assert.deepEqual(october.segments.b2g, { realized: 0, tiers: null });
      assert.deepEqual(september.segments.b2b, { realized: 1000, tiers: null });
      assert.equal(september.segments.b2g.realized, 50);
      assert.equal(september.total.tiers, null);
      const a1 = (item) => item.people.find((person) => person.vendorId === String(seed.vendorA1._id));
      assert.deepEqual([a1(september).realized, a1(september).tiers], [700, null]);
      assert.deepEqual(a1(october).tiers, { goal: 4000, super: 4800, black: 0 });
    });

    it("quantidade de meses de 1 a 12; só master e admin", async () => {
      assert.equal((await request("GET", `/goals/${MONTH}/history`, tokens.admin)).body.data.months.length, 6);
      assert.equal((await request("GET", `/goals/${MONTH}/history?months=13`, tokens.admin)).status, 400);
      assert.equal((await request("GET", `/goals/${MONTH}/history?months=0`, tokens.admin)).status, 400);
      assert.equal((await request("GET", `/goals/${MONTH}/history`, tokens.b2b)).status, 403);
    });
  });
});
