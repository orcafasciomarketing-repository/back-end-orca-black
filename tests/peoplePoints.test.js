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

describe("GET /analytics/people-points", () => {
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
      buildSale("p1", seed.vendorA1, "b2b", "sales", days[0], { sdrIds: [seed.sdrB._id, seed.csB._id] }),
      buildSale("p2", seed.vendorA1, "b2g", "farm", days[1], { sdrIds: [seed.sdrG._id] }),
      buildSale("p3", seed.vendorB1, "b2b", "sales", days[2]),
      buildSale("p4", seed.vendorC1, "b2g", "sales", days[2], { dealStatus: "cancelada" }),
    ]);
  });

  after(async () => {
    await testApp.stop();
  });

  const getPeople = async (token, query = "") => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${testApp.baseUrl}/analytics/people-points${query}`, { headers });
    return { status: res.status, body: await res.json() };
  };

  const personOf = (data, name) => data.people.find((person) => person.name === name);

  it("sem login → 401 (é do admin, não das TVs)", async () => {
    const { status } = await getPeople(null);
    assert.equal(status, 401);
  });

  it("todas as pessoas com o time e os pontos de venda, renovação e passagem", async () => {
    const { status, body } = await getPeople(tokens.admin);
    const { data } = body;

    assert.equal(status, 200);
    assert.equal(data.period, "all");
    assert.equal(data.people.length, 8);
    assert.deepEqual(
      data.teams.map((team) => team.teamName),
      ["Time A", "Time B", "Time C"],
    );

    const vendorA1 = personOf(data, "Vendor A1");
    assert.equal(vendorA1.kind, "vendor");
    assert.equal(String(vendorA1.teamId), String(seed.teamA._id));
    assert.equal(vendorA1.sales, TEST_POINTS.b2bSale);
    assert.equal(vendorA1.farm, TEST_POINTS.b2gFarm);
    assert.equal(vendorA1.passage, 0);
    assert.equal(vendorA1.total, TEST_POINTS.b2bSale + TEST_POINTS.b2gFarm);

    const csB = personOf(data, "CS B");
    assert.equal(csB.kind, "sdr");
    assert.equal(csB.passage, TEST_POINTS.cs);
    assert.equal(csB.total, TEST_POINTS.cs);

    assert.equal(personOf(data, "SDR G").passage, TEST_POINTS.b2gSdr);
    assert.equal(personOf(data, "Vendor C1").total, 0);
    assert.equal(personOf(data, "Suporte C").total, 0);
  });

  it("ordena do maior para o menor total", async () => {
    const { body } = await getPeople(tokens.admin);
    const totals = body.data.people.map((person) => person.total);

    assert.deepEqual(totals, [...totals].sort((a, b) => b - a));
  });

  it("os pontos de cada pessoa batem com o placar dos times", async () => {
    const [{ body: people }, scoreboard] = await Promise.all([
      getPeople(tokens.admin),
      fetch(`${testApp.baseUrl}/analytics/scoreboard`).then((res) => res.json()),
    ]);

    for (const team of scoreboard.data) {
      const teamTotal = people.data.people
        .filter((person) => String(person.teamId) === String(team.teamId))
        .reduce((sum, person) => sum + person.total, 0);
      assert.equal(teamTotal, team.total, team.teamName);
    }
  });

  it("com ?from e ?to: só as vendas desses dias", async () => {
    const { body } = await getPeople(tokens.admin, `?from=${days[1]}&to=${days[2]}`);

    assert.equal(body.data.from, days[1]);
    assert.equal(body.data.to, days[2]);
    assert.equal(personOf(body.data, "Vendor A1").total, TEST_POINTS.b2gFarm);
    assert.equal(personOf(body.data, "Vendor B1").total, TEST_POINTS.b2bSale);
    assert.equal(personOf(body.data, "CS B").total, 0);
  });

  it("com ?segment=b2g: só as vendas B2G", async () => {
    const { body } = await getPeople(tokens.admin, "?segment=b2g");

    assert.equal(body.data.segment, "b2g");
    assert.equal(personOf(body.data, "Vendor A1").total, TEST_POINTS.b2gFarm);
    assert.equal(personOf(body.data, "SDR B").total, 0);
  });

  it("perfil b2b recebe sempre o B2B, mesmo pedindo outro setor", async () => {
    const { body } = await getPeople(tokens.b2b, "?segment=b2g");

    assert.equal(body.data.segment, "b2b");
    assert.equal(personOf(body.data, "Vendor A1").total, TEST_POINTS.b2bSale);
    assert.equal(personOf(body.data, "SDR G").total, 0);
  });

  it("período ou datas inválidos são ignorados", async () => {
    const { body } = await getPeople(tokens.admin, "?period=qualquer&from=ontem&to=1");

    assert.equal(body.data.period, "all");
    assert.equal(body.data.from, null);
    assert.equal(body.data.to, null);
    assert.equal(personOf(body.data, "Vendor A1").total, TEST_POINTS.b2bSale + TEST_POINTS.b2gFarm);
  });
});
