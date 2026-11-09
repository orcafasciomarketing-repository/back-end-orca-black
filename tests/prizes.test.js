const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Com master configurado: o admin vê, mas não registra nem exclui.
// Precisa vir antes dos requires do projeto (o config/roles lê ao carregar)
process.env.MASTER_EMAIL = "Master@Teste.com";
process.env.PRIZE_POINTS_STEP = "10";

const { startTestApp, seedBase, clearDatabase, createUserToken, TEST_POINTS } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const SDR = require("../features/sdr/model/sdrModel");
const User = require("../features/user/model/userModel");
const PrizeWithdrawal = require("../features/prizes/model/prizeWithdrawalModel");

const DAY_MS = 24 * 60 * 60 * 1000;

const addDays = (day, amount) => new Date(new Date(`${day}T12:00:00Z`).getTime() + amount * DAY_MS).toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() || 7) - 1));
// Um dia da semana passada (já fechada) e um da semana em andamento
const lastWeekDay = addDays(monday, -3);
const midnightOf = (day) => new Date(`${day}T03:00:00.000Z`);

describe("Prêmios (/prizes)", () => {
  let testApp;
  let seed;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
    await clearDatabase();
    await Promise.all([User.deleteMany({}), PrizeWithdrawal.deleteMany({})]);
    seed = await seedBase();

    // Cargos com o setor, como no cadastro de verdade
    await Vendors.updateOne({ _id: seed.vendorA1._id }, { job: "B2B Venda" });
    await Vendors.updateOne({ _id: seed.vendorB1._id }, { job: "B2G Venda" });

    tokens = {
      master: await createUserToken("admin", "master@teste.com"),
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      b2g: await createUserToken("b2g"),
    };

    const buildSale = (rdDealId, vendor, segment, day, extra = {}) => ({
      rdDealId,
      vendorId: vendor._id,
      value: 1000,
      rdUpdatedAt: new Date(),
      segment,
      funnelType: "sales",
      realizedAt: midnightOf(day),
      dealStatus: "ativa",
      ...extra,
    });

    // Vendor A1: 4 vendas B2B na semana passada (12 pontos) + 1 nesta semana (3, em andamento).
    // SDR B: 4 passagens (4 pontos). CS B: 2 passagens (14 pontos)
    await Sales.create([
      buildSale("a1-1", seed.vendorA1, "b2b", lastWeekDay, { sdrIds: [seed.sdrB._id, seed.csB._id] }),
      buildSale("a1-2", seed.vendorA1, "b2b", lastWeekDay, { sdrIds: [seed.sdrB._id, seed.csB._id] }),
      buildSale("a1-3", seed.vendorA1, "b2b", lastWeekDay, { sdrIds: [seed.sdrB._id] }),
      buildSale("a1-4", seed.vendorA1, "b2b", lastWeekDay, { sdrIds: [seed.sdrB._id] }),
      buildSale("a1-now", seed.vendorA1, "b2b", today),
      buildSale("b1-1", seed.vendorB1, "b2g", lastWeekDay),
    ]);
  });

  after(async () => {
    await testApp.stop();
  });

  const request = async (method, path, token, body) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const getSummary = (token, query = "") => request("GET", `/prizes${query}`, token);
  const personOf = (body, name) => body.data.people.find((person) => person.name === name);

  const withdrawalFor = (person, extra = {}) => ({
    personId: String(person._id),
    kind: "vendor",
    quantity: 1,
    prize: "Fone JBL",
    withdrawnAt: monday,
    ...extra,
  });

  it("sem login → 401", async () => {
    const { status } = await getSummary(null);
    assert.equal(status, 401);
  });

  it("admin vê todo mundo: pontos das semanas fechadas, semana em andamento, direitos e saldo", async () => {
    const { status, body } = await getSummary(tokens.admin);

    assert.equal(status, 200);
    assert.equal(body.data.step, 10);
    assert.equal(body.data.currentWeek.start, monday);
    assert.equal(body.data.closedUntil, addDays(monday, -1));

    const vendorA1 = personOf(body, "Vendor A1");
    assert.equal(vendorA1.accumulated, 4 * TEST_POINTS.b2bSale);
    assert.equal(vendorA1.currentWeek, TEST_POINTS.b2bSale);
    assert.equal(vendorA1.earned, 1);
    assert.equal(vendorA1.balance, 1);
    assert.equal(vendorA1.pointsToNext, 20 - 5 * TEST_POINTS.b2bSale);

    // SDR, CS e Suporte também ganham prêmios
    const csB = personOf(body, "CS B");
    assert.equal(csB.kind, "sdr");
    assert.equal(csB.accumulated, 2 * TEST_POINTS.cs);
    assert.equal(csB.earned, 1);

    assert.ok(personOf(body, "Vendor B1"));
    assert.ok(personOf(body, "Suporte C"));
  });

  it("b2b vê só as pessoas com cargo B2B (sem B2G, CS e Suporte), mesmo pedindo outro setor", async () => {
    const { status, body } = await getSummary(tokens.b2b, "?segment=b2g");

    assert.equal(status, 200);
    assert.equal(body.data.segment, "b2b");
    assert.deepEqual(body.data.people.map((person) => person.name).sort(), ["SDR B", "Vendor A1"]);
  });

  it("b2g vê só as pessoas com cargo B2G", async () => {
    const { body } = await getSummary(tokens.b2g);
    assert.deepEqual(body.data.people.map((person) => person.name).sort(), ["SDR G", "Vendor B1"]);
  });

  it("só o master registra e exclui: admin, b2b e b2g → 403", async () => {
    for (const token of [tokens.admin, tokens.b2b, tokens.b2g]) {
      const created = await request("POST", "/prizes/withdrawals", token, withdrawalFor(seed.vendorA1));
      assert.equal(created.status, 403);

      const deleted = await request("DELETE", `/prizes/withdrawals/${seed.vendorA1._id}`, token);
      assert.equal(deleted.status, 403);
    }
    assert.equal(await PrizeWithdrawal.countDocuments(), 0);
  });

  it("recusa retirada sem prêmio, com quantidade 0, data inválida ou pessoa que não existe", async () => {
    const cases = [
      [{ prize: "  " }, 400],
      [{ quantity: 0 }, 400],
      [{ withdrawnAt: "2026-02-30" }, 400],
      [{ kind: "outro" }, 400],
      [{ personId: "000000000000000000000000" }, 404],
      // id de vendedor com kind "sdr": não é uma pessoa de passagem
      [{ kind: "sdr" }, 404],
    ];

    for (const [extra, expected] of cases) {
      const { status } = await request("POST", "/prizes/withdrawals", tokens.master, withdrawalFor(seed.vendorA1, extra));
      assert.equal(status, expected, JSON.stringify(extra));
    }
    assert.equal(await PrizeWithdrawal.countDocuments(), 0);
  });

  it("registra a retirada e o saldo cai; acima do saldo pede confirmação (409) e com ela registra", async () => {
    const first = await request("POST", "/prizes/withdrawals", tokens.master, withdrawalFor(seed.vendorA1));
    assert.equal(first.status, 201);
    assert.equal(first.body.data.prize, "Fone JBL");
    assert.equal(first.body.data.createdBy, "master@teste.com");
    assert.equal(personOf((await getSummary(tokens.admin)).body, "Vendor A1").balance, 0);

    const over = await request("POST", "/prizes/withdrawals", tokens.master, withdrawalFor(seed.vendorA1));
    assert.equal(over.status, 409);
    assert.equal(over.body.error, "Vendor A1 tem saldo de 0 prêmios. Confirme para registrar mesmo assim");

    const confirmed = await request(
      "POST",
      "/prizes/withdrawals",
      tokens.master,
      withdrawalFor(seed.vendorA1, { confirmOverBalance: true }),
    );
    assert.equal(confirmed.status, 201);

    const vendorA1 = personOf((await getSummary(tokens.admin)).body, "Vendor A1");
    assert.equal(vendorA1.withdrawn, 2);
    assert.equal(vendorA1.balance, -1);

    // Excluir a retirada errada devolve o saldo
    const deleted = await request("DELETE", `/prizes/withdrawals/${confirmed.body.data._id}`, tokens.master);
    assert.equal(deleted.status, 200);
    assert.equal(personOf((await getSummary(tokens.admin)).body, "Vendor A1").balance, 0);

    const again = await request("DELETE", `/prizes/withdrawals/${confirmed.body.data._id}`, tokens.master);
    assert.equal(again.status, 404);
    assert.equal((await request("DELETE", "/prizes/withdrawals/nao-e-id", tokens.master)).status, 404);
  });

  it("venda cancelada depois da retirada: fica devendo; a venda nova só zera o saldo", async () => {
    // Vendor A1 já retirou 1 (teste anterior). Cancela uma venda de 3 pontos: 9 pontos, devendo 1
    await Sales.updateOne({ rdDealId: "a1-1" }, { dealStatus: "cancelada" });
    let vendorA1 = personOf((await getSummary(tokens.admin)).body, "Vendor A1");
    assert.equal(vendorA1.earned, 0);
    assert.equal(vendorA1.balance, -1);
    assert.equal(vendorA1.debtPoints, 10 - 3 * TEST_POINTS.b2bSale);

    // Venda nova substitui a cancelada: volta para 12 pontos, saldo 0 (não ganha outro prêmio)
    await Sales.create({
      rdDealId: "a1-5",
      vendorId: seed.vendorA1._id,
      value: 1000,
      rdUpdatedAt: new Date(),
      segment: "b2b",
      funnelType: "sales",
      realizedAt: midnightOf(lastWeekDay),
      dealStatus: "ativa",
    });
    vendorA1 = personOf((await getSummary(tokens.admin)).body, "Vendor A1");
    assert.equal(vendorA1.earned, 1);
    assert.equal(vendorA1.withdrawn, 1);
    assert.equal(vendorA1.balance, 0);
  });

  it("histórico: retiradas com o nome; b2b vê as do setor e b2g não vê as do B2B", async () => {
    // A venda cancelada no teste anterior também tirou a passagem do CS B (ficou com 7 pontos, sem
    // saldo): a retirada dele precisa da confirmação
    const csB = await SDR.findOne({ name: "CS B" });
    const csWithdrawal = await request(
      "POST",
      "/prizes/withdrawals",
      tokens.master,
      withdrawalFor(csB, { kind: "sdr", prize: "Caneca", confirmOverBalance: true }),
    );
    assert.equal(csWithdrawal.status, 201);

    const all = await request("GET", "/prizes/withdrawals", tokens.admin);
    assert.equal(all.status, 200);
    assert.deepEqual(all.body.data.map((item) => [item.name, item.prize]).sort(), [
      ["CS B", "Caneca"],
      ["Vendor A1", "Fone JBL"],
    ]);

    const onePerson = await request("GET", `/prizes/withdrawals?kind=sdr&personId=${csB._id}`, tokens.admin);
    assert.deepEqual(onePerson.body.data.map((item) => item.name), ["CS B"]);

    const b2b = await request("GET", "/prizes/withdrawals", tokens.b2b);
    assert.deepEqual(b2b.body.data.map((item) => item.name), ["Vendor A1"]);

    const b2g = await request("GET", "/prizes/withdrawals", tokens.b2g);
    assert.deepEqual(b2g.body.data, []);
  });
});
