const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.ROUND_ENCRYPTION = "4";
process.env.MASTER_EMAIL = "master@teste.com";

const { startTestApp, seedBase, clearDatabase, createUserToken } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const User = require("../features/user/model/userModel");
const MonthlyGoal = require("../features/goals/model/monthlyGoalModel");
const { generateAccessToken } = require("../shared/accessTokenService");
const { personForVendor, historyEntryForVendor, toVisibility } = require("../features/goals/service/goalVisibility");

describe("O que o vendedor vê (goalVisibility)", () => {
  const progress = (realized, tiers, extra = {}) => ({
    realized,
    tiers,
    reached: [],
    current: "goal",
    target: tiers.goal,
    remaining: 0,
    available: ["goal", "super", "black"],
    excess: 0,
    pace: { status: "ahead" },
    ...extra,
  });
  const person = () => ({
    vendorId: "a1",
    segment: "b2b",
    ticket: 1000,
    conversion: 50,
    month: progress(5000, { goal: 4000, super: 4800, black: 6000 }, { salesNeeded: 1, leadsNeeded: 2 }),
    forecast: { scenarios: { realistic: 7000 }, tiers: { goal: { target: 4000 }, super: { target: 4800 }, black: { target: 6000 } } },
    weeks: [progress(1000, { goal: 1000, super: 1200, black: 1500 })],
    cumulative: [5000],
  });

  it("tudo à mostra: mesma meta, sem mudar o objeto recebido", () => {
    const original = person();
    const shown = personForVendor(original, toVisibility(null));
    assert.deepEqual(shown.month.tiers, original.month.tiers);
    assert.deepEqual(shown.forecast, original.forecast);
    assert.equal(shown.weeks.length, 1);
    assert.equal(shown.ticket, 1000);
  });

  it("Black escondida: some das faixas, da previsão e das semanas; a faixa atual e o que falta são recalculados", () => {
    const original = person();
    const shown = personForVendor(original, toVisibility({ hidden: ["black"] }));

    assert.deepEqual(shown.month.tiers, { goal: 4000, super: 4800, black: 0 });
    assert.deepEqual(shown.month.available, ["goal", "super"]);
    assert.deepEqual(shown.month.reached, ["goal", "super"]);
    assert.equal(shown.month.current, "super");
    assert.equal(shown.month.excess, 200);
    assert.equal(shown.month.salesNeeded, 0);
    assert.deepEqual(Object.keys(shown.forecast.tiers), ["goal", "super"]);
    assert.deepEqual(shown.weeks[0].available, ["goal", "super"]);
    assert.equal(original.month.tiers.black, 6000);
    assert.deepEqual(Object.keys(original.forecast.tiers), ["goal", "super", "black"]);
  });

  it("Super escondida: a próxima faixa depois da Meta passa a ser a Black", () => {
    const shown = personForVendor(person(), toVisibility({ hidden: ["super"] }));
    assert.deepEqual(shown.month.available, ["goal", "black"]);
    assert.equal(shown.month.current, "black");
    assert.equal(shown.month.remaining, 1000);
    assert.equal(shown.month.salesNeeded, 1);
    assert.equal(shown.month.leadsNeeded, 2);
  });

  it("widgets escondidos vêm sem os dados deles", () => {
    const shown = personForVendor(person(), toVisibility({ hidden: ["forecast", "breakdown", "week", "weeks"] }));
    assert.equal(shown.forecast, null);
    assert.deepEqual(shown.weeks, []);
    assert.equal(shown.ticket, null);
    assert.equal(shown.conversion, null);
    assert.equal("salesNeeded" in shown.month, false);
    assert.equal("leadsNeeded" in shown.month, false);

    assert.equal(personForVendor(person(), toVisibility({ hidden: ["weeks"] })).weeks.length, 1);
  });

  it("histórico: mês fechado fica sem faixas; faixa escondida no mês vira 0", () => {
    const entry = { vendorId: "a1", realized: 10, tiers: { goal: 100, super: 120, black: 150 } };
    assert.equal(historyEntryForVendor(entry, toVisibility({ open: false })).tiers, null);
    assert.deepEqual(historyEntryForVendor(entry, toVisibility({ hidden: ["black"] })).tiers, { goal: 100, super: 120, black: 0 });
    assert.equal(historyEntryForVendor(entry, toVisibility(null)).realized, 10);
  });

  it("chaves desconhecidas são ignoradas; sem configuração = liberado e tudo à mostra", () => {
    assert.deepEqual(toVisibility(null), { open: true, hidden: [] });
    assert.deepEqual(toVisibility({ open: false, hidden: ["black", "xx", "summary"] }), { open: false, hidden: ["summary", "black"] });
  });
});

describe("Metas cadastradas, setor que gerencia e o que o vendedor vê (API)", () => {
  let testApp;
  let seed;
  let tokens;

  const MONTH = "2026-10";

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  const userToken = async (email, fields) => {
    await User.collection.insertOne({ email, passwordHash: "x", ...fields });
    const user = await User.findOne({ email });
    return generateAccessToken({ id: user._id, email: user.email });
  };

  beforeEach(async () => {
    await clearDatabase();
    await Promise.all([User.deleteMany({}), MonthlyGoal.deleteMany({})]);
    seed = await seedBase();
    await Vendors.updateOne({ _id: seed.vendorA1._id }, { job: "B2B Venda" });
    await Vendors.updateOne({ _id: seed.vendorA2._id }, { job: "B2B Farmer" });
    await Vendors.updateOne({ _id: seed.vendorB1._id }, { job: "B2G Venda" });
    await Vendors.updateOne({ _id: seed.vendorC1._id }, { job: "B2G Farmer" });

    tokens = {
      master: await createUserToken("admin", "master@teste.com"),
      admin: await createUserToken("admin"),
      tony: await userToken("tony@teste.com", { role: "admin", manageSegment: "b2b" }),
      george: await userToken("george@teste.com", { role: "admin", manageSegment: "b2g" }),
      b2b: await createUserToken("b2b"),
      vendor: await userToken("a1@teste.com", { role: "vendor", vendorId: seed.vendorA1._id }),
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

  const b2b = () => ({
    levels: [
      { key: "jr", name: "Júnior", type: "sales", goal: 4000, superGoal: 4800 },
      { key: "sr", name: "Sênior", type: "farm", goal: 6000, superGoal: 7200 },
    ],
    tickets: { farm: 2000, sales: 1000 },
    conversion: { farm: null, sales: 30 },
    people: [
      { vendorId: String(seed.vendorA1._id), level: "jr", goal: 4000, superGoal: 4800 },
      { vendorId: String(seed.vendorA2._id), level: "sr", goal: 6000, superGoal: 7200 },
    ],
  });
  const b2g = () => ({
    levels: [
      { key: "jr", name: "Júnior", type: "sales", goal: 3000, superGoal: 3500 },
      { key: "jr", name: "Júnior", type: "farm", goal: 2000, superGoal: 2500 },
    ],
    people: [
      { vendorId: String(seed.vendorB1._id), level: "jr", goal: 3000, superGoal: 3500 },
      { vendorId: String(seed.vendorC1._id), level: "jr", goal: 2000, superGoal: 2500 },
    ],
  });
  const november = () => ({
    ...b2b(),
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
  });

  const visibility = (month, segment, body, token = tokens.master) =>
    request("PUT", `/goals/${month}/${segment}/visibility`, token, body);

  describe("GET /goals (metas cadastradas)", () => {
    it("lista os meses e setores do mais novo para o mais antigo, com as faixas e o que os vendedores veem", async () => {
      assert.deepEqual((await request("GET", "/goals", tokens.admin)).body.data, []);
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await request("PUT", `/goals/${MONTH}/b2g`, tokens.master, b2g());
      await request("PUT", "/goals/2026-11/b2b", tokens.master, november());

      const { status, body } = await request("GET", "/goals", tokens.admin);
      assert.equal(status, 200);
      assert.deepEqual(
        body.data.map((item) => [item.month, item.segment]),
        [
          ["2026-11", "b2b"],
          [MONTH, "b2b"],
          [MONTH, "b2g"],
        ],
      );
      const october = body.data[1];
      assert.deepEqual(october.tiers, { goal: 10000, super: 12000, black: 0 });
      assert.deepEqual(october.parts.farm, { goal: 6000, super: 7200, black: 0 });
      assert.equal(october.people, 2);
      assert.deepEqual(october.visibility, { open: true, hidden: [] });
      assert.equal(october.updatedBy, "master@teste.com");
      assert.equal(body.data[0].tiers.black, 6000);
    });

    it("todos os admins veem a lista e os meses dos dois setores; b2b e vendedor → 403", async () => {
      for (const token of [tokens.tony, tokens.george, tokens.admin]) {
        assert.equal((await request("GET", "/goals", token)).status, 200);
        assert.equal((await request("GET", `/goals/${MONTH}`, token)).status, 200);
        assert.equal((await request("GET", `/goals/${MONTH}/progress`, token)).status, 200);
      }
      assert.equal((await request("GET", "/goals", tokens.b2b)).status, 403);
      assert.equal((await request("GET", "/goals", tokens.vendor)).status, 403);
    });
  });

  describe("setor que gerencia", () => {
    it("admin de um setor cadastra, edita, exclui e escolhe o que os vendedores veem só no setor dele", async () => {
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.tony, b2b())).status, 200);
      const blocked = await request("PUT", `/goals/${MONTH}/b2g`, tokens.tony, b2g());
      assert.equal(blocked.status, 403);
      assert.match(blocked.body.error, /só gerencia as metas do B2B/);

      assert.equal((await request("PUT", `/goals/${MONTH}/b2g`, tokens.george, b2g())).status, 200);
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.george, b2b())).status, 403);
      assert.equal((await visibility(MONTH, "b2b", { open: false, hidden: [] }, tokens.george)).status, 403);
      assert.equal((await request("DELETE", `/goals/${MONTH}/b2b`, tokens.george)).status, 403);

      assert.equal((await visibility(MONTH, "b2b", { open: false, hidden: [] }, tokens.tony)).status, 200);
      assert.equal((await request("DELETE", `/goals/${MONTH}/b2g`, tokens.tony)).status, 403);
      assert.equal((await request("DELETE", `/goals/${MONTH}/b2b`, tokens.tony)).status, 200);
      assert.equal(await MonthlyGoal.countDocuments({}), 1);
    });

    it("master e admin sem setor gerenciam os dois; b2b → 403", async () => {
      for (const token of [tokens.master, tokens.admin]) {
        assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, token, b2b())).status, 200);
        assert.equal((await request("PUT", `/goals/${MONTH}/b2g`, token, b2g())).status, 200);
        assert.equal((await visibility(MONTH, "b2g", { open: true, hidden: ["black"] }, token)).status, 200);
      }
      assert.equal((await request("PUT", `/goals/${MONTH}/b2b`, tokens.b2b, b2b())).status, 403);
    });
  });

  describe("PUT /goals/:mes/:setor/visibility", () => {
    it("salva, aparece no cadastro do mês e na lista; mês sem meta → 404; item inválido → 400", async () => {
      assert.equal((await visibility(MONTH, "b2b", { open: true, hidden: [] })).status, 404);
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());

      const saved = await visibility(MONTH, "b2b", { open: false, hidden: ["forecast", "black", "black"] });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.body.data, { open: false, hidden: ["forecast", "black"] });

      const month = (await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data;
      assert.deepEqual(month.segments.b2b.config.visibility, { open: false, hidden: ["forecast", "black"] });

      assert.equal((await visibility(MONTH, "b2b", { open: true, hidden: ["xx"] })).status, 400);
      assert.equal((await visibility(MONTH, "b2b", { hidden: [] })).status, 400);
      assert.equal((await visibility(MONTH, "b2b", { open: true, hidden: [], extra: 1 })).status, 400);
    });

    it("salvar as metas de novo não muda o que os vendedores veem; mês novo copia do último cadastrado", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await visibility(MONTH, "b2b", { open: true, hidden: ["comparison"] });
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      assert.deepEqual((await MonthlyGoal.findOne({ month: MONTH })).toObject().visibility.hidden, ["comparison"]);

      await request("PUT", "/goals/2027-01/b2b", tokens.master, b2b());
      const next = (await request("GET", "/goals/2027-01", tokens.admin)).body.data.segments.b2b.config;
      assert.deepEqual(next.visibility, { open: true, hidden: ["comparison"] });

      await request("PUT", `/goals/${MONTH}/b2g`, tokens.master, b2g());
      const other = (await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data.segments.b2g.config;
      assert.deepEqual(other.visibility, { open: true, hidden: [] });
    });

    it("mês salvo antes (sem o campo) vale como liberado e com tudo à mostra", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await MonthlyGoal.collection.updateOne({ month: MONTH }, { $unset: { visibility: "" } });
      const config = (await request("GET", `/goals/${MONTH}`, tokens.admin)).body.data.segments.b2b.config;
      assert.deepEqual(config.visibility, { open: true, hidden: [] });
    });
  });

  describe("GET /me/goals com o que o vendedor pode ver", () => {
    const sale = (rdDealId, vendor, day, value) => ({
      rdDealId,
      vendorId: vendor._id,
      value,
      rdUpdatedAt: new Date(),
      segment: "b2b",
      funnelType: "sales",
      realizedAt: new Date(`${day}T15:00:00Z`),
      dealStatus: "ativa",
    });

    it("mês fechado: person null e closed true; liberado de novo, volta", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await visibility(MONTH, "b2b", { open: false, hidden: [] });

      const closed = (await request("GET", `/me/goals?month=${MONTH}`, tokens.vendor)).body.data;
      assert.equal(closed.person, null);
      assert.equal(closed.closed, true);
      assert.deepEqual(closed.history.months, []);

      await visibility(MONTH, "b2b", { open: true, hidden: [] });
      const open = (await request("GET", `/me/goals?month=${MONTH}`, tokens.vendor)).body.data;
      assert.equal(open.closed, false);
      assert.equal(open.person.month.tiers.goal, 4000);
    });

    it("fechar o B2G não muda nada para o vendedor do B2B", async () => {
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await request("PUT", `/goals/${MONTH}/b2g`, tokens.master, b2g());
      await visibility(MONTH, "b2g", { open: false, hidden: ["black", "super"] });
      const data = (await request("GET", `/me/goals?month=${MONTH}`, tokens.vendor)).body.data;
      assert.equal(data.closed, false);
      assert.equal(data.person.month.tiers.super, 4800);
    });

    it("Black escondida no mês da campanha: some da meta, da previsão e das semanas do vendedor", async () => {
      await request("PUT", "/goals/2026-11/b2b", tokens.master, november());
      await Sales.create([sale("n1", seed.vendorA1, "2026-11-03", 1600)]);

      const full = (await request("GET", "/me/goals?month=2026-11", tokens.vendor)).body.data;
      assert.deepEqual(full.person.month.available, ["goal", "super", "black"]);

      await visibility("2026-11", "b2b", { open: true, hidden: ["black"] });
      const { data } = (await request("GET", "/me/goals?month=2026-11", tokens.vendor)).body;
      assert.deepEqual(data.visibility, { open: true, hidden: ["black"] });
      assert.equal(data.person.month.tiers.black, 0);
      assert.deepEqual(data.person.month.available, ["goal", "super"]);
      assert.equal(data.person.month.current, "super");
      assert.ok(data.person.weeks.every((week) => week.tiers.black === 0));
      assert.equal("black" in data.person.forecast.tiers, false);
      const novemberEntry = data.history.months.find((item) => item.month === "2026-11");
      assert.equal(novemberEntry.people[0].tiers.black, 0);

      const admin = (await request("GET", "/goals/2026-11/progress", tokens.admin)).body.data;
      assert.equal(admin.people.find((item) => item.vendorId === String(seed.vendorA1._id)).month.tiers.black, 3000);
    });

    it("widgets escondidos vêm sem os dados; o histórico usa o que vale em cada mês", async () => {
      await request("PUT", "/goals/2026-09/b2b", tokens.master, b2b());
      await request("PUT", `/goals/${MONTH}/b2b`, tokens.master, b2b());
      await visibility("2026-09", "b2b", { open: false, hidden: [] });
      await visibility(MONTH, "b2b", { open: true, hidden: ["forecast", "breakdown", "week", "weeks"] });

      const { data } = (await request("GET", `/me/goals?month=${MONTH}`, tokens.vendor)).body;
      assert.equal(data.person.forecast, null);
      assert.deepEqual(data.person.weeks, []);
      assert.equal(data.person.ticket, null);
      assert.equal("salesNeeded" in data.person.month, false);
      assert.equal(data.history.months.find((item) => item.month === "2026-09").people[0].tiers, null);
      assert.equal(data.history.months.find((item) => item.month === MONTH).people[0].tiers.goal, 4000);

      await visibility(MONTH, "b2b", { open: true, hidden: ["comparison", "evolution"] });
      assert.deepEqual((await request("GET", `/me/goals?month=${MONTH}`, tokens.vendor)).body.data.history.months, []);
    });
  });

  describe("setor que gerencia no cadastro de usuários", () => {
    const create = (token, body) =>
      request("POST", "/users", token, { password: "123456", passwordConfirmation: "123456", ...body });

    it("o master escolhe o setor do admin ao cadastrar e ao editar; a lista mostra", async () => {
      const created = await create(tokens.master, { email: "novo@teste.com", role: "admin", manageSegment: "b2g" });
      assert.equal(created.status, 201);
      assert.equal(created.body.data.manageSegment, "b2g");

      const id = created.body.data._id;
      const patch = (body) => request("PATCH", `/users/${id}`, tokens.master, body);
      assert.equal((await patch({ manageSegment: "b2b" })).body.data.manageSegment, "b2b");
      assert.equal((await patch({ manageSegment: null })).body.data.manageSegment, null);
      assert.equal((await User.findById(id)).manageSegment, undefined);
      await patch({ manageSegment: "b2g" });

      const users = (await request("GET", "/users", tokens.master)).body.data;
      assert.equal(users.find((user) => user.email === "novo@teste.com").manageSegment, "b2g");
      assert.equal(users.find((user) => user.email === "tony@teste.com").manageSegment, "b2b");
      assert.equal(users.find((user) => user.email === "master@teste.com").manageSegment, null);

      assert.equal((await patch({ role: "b2b" })).body.data.manageSegment, null);
      assert.equal((await User.findById(id)).manageSegment, undefined);
    });

    it("só admin tem setor; setor inválido → 400; o admin não edita (só o master)", async () => {
      const created = await create(tokens.master, { email: "b2b2@teste.com", role: "b2b" });
      const id = created.body.data._id;
      assert.equal(created.body.data.manageSegment, null);
      assert.equal((await request("PATCH", `/users/${id}`, tokens.master, { manageSegment: "b2b" })).status, 400);
      assert.equal((await create(tokens.master, { email: "x@teste.com", role: "admin", manageSegment: "xx" })).status, 400);
      assert.equal((await request("PATCH", `/users/${id}`, tokens.tony, { manageSegment: null })).status, 403);

      const vendorUser = await create(tokens.master, { email: "v@teste.com", role: "b2g", manageSegment: "b2b" });
      assert.equal(vendorUser.body.data.manageSegment, null);
    });

    it("admin de um setor cadastra admin só com o mesmo setor; admin sem setor, sem setor", async () => {
      const byTony = await create(tokens.tony, { email: "t2@teste.com", role: "admin", manageSegment: null });
      assert.equal(byTony.body.data.manageSegment, "b2b");
      const byAdmin = await create(tokens.admin, { email: "a2@teste.com", role: "admin", manageSegment: "b2g" });
      assert.equal(byAdmin.body.data.manageSegment, null);
    });

    it("o login devolve o setor que gerencia", async () => {
      await create(tokens.master, { email: "login@teste.com", role: "admin", manageSegment: "b2b" });
      const res = await request("POST", "/auth/login", undefined, { email: "login@teste.com", password: "123456" });
      assert.equal(res.status, 200);
      assert.equal(res.body.data?.user?.manageSegment ?? res.body.user?.manageSegment, "b2b");
    });
  });
});
