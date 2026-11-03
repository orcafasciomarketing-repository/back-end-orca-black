const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildSheetRow,
  sendSheet,
  TEST_POINTS,
} = require("./helpers/testApp");

const { getSalePoints, getPassagePoints } = require("../config/points");

describe("Tabela de pontos (config/points.js)", () => {
  describe("venda: Setor + Classificação", () => {
    for (const [segment, funnelType, expected] of [
      ["b2g", "sales", TEST_POINTS.b2gSale],
      ["b2g", "farm", TEST_POINTS.b2gFarm],
      ["b2b", "sales", TEST_POINTS.b2bSale],
      ["b2b", "farm", TEST_POINTS.b2bFarm],
    ]) {
      it(`${segment} + ${funnelType} → ${expected}`, () => {
        assert.equal(getSalePoints({ segment, funnelType }), expected);
      });
    }

    it("combinação fora da tabela → 0", () => {
      assert.equal(getSalePoints({ segment: "gov", funnelType: "sales" }), 0);
    });
  });

  describe("passagem: cargo da pessoa", () => {
    for (const [job, expected] of [
      ["B2G SDR", TEST_POINTS.b2gSdr],
      ["B2B SDR", TEST_POINTS.b2bSdr],
      ["CS", TEST_POINTS.cs],
      ["Suporte", TEST_POINTS.suporte],
    ]) {
      it(`"${job}" → ${expected}`, () => {
        assert.equal(getPassagePoints({ job }), expected);
      });
    }

    it("ignora maiúscula, acento e espaço sobrando", () => {
      assert.equal(getPassagePoints({ job: " b2g  sdr " }), TEST_POINTS.b2gSdr);
      assert.equal(getPassagePoints({ job: "SUPÓRTE" }), TEST_POINTS.suporte);
    });

    it("cargo fora da tabela ou sem cargo → 0", () => {
      assert.equal(getPassagePoints({ job: "Gerente" }), 0);
      assert.equal(getPassagePoints({}), 0);
      assert.equal(getPassagePoints(undefined), 0);
    });
  });
});

describe("Pontos no placar e nos rankings (planilha → analytics)", () => {
  let testApp;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    await seedBase();
  });

  const getData = async (path) => {
    const res = await fetch(`${testApp.baseUrl}/analytics${path}`);
    return (await res.json()).data;
  };

  const getTeam = async (teamName) =>
    (await getData("/scoreboard")).find((team) => team.teamName === teamName);

  it("venda B2G vale mais que a B2B no placar e no ranking de vendedores", async () => {
    await sendSheet(testApp.baseUrl, [
      buildSheetRow({ id: "g1", vendor: "Vendor A1", sector: "B2G" }),
      buildSheetRow({ id: "g2", vendor: "Vendor A1", sector: "B2G", classification: "Renovação" }),
      buildSheetRow({ id: "b1", vendor: "Vendor B1", sector: "B2B" }),
      buildSheetRow({ id: "b2", vendor: "Vendor B1", sector: "B2B", classification: "Renovação" }),
    ]);

    const teamA = await getTeam("Time A");
    assert.equal(teamA.sales, TEST_POINTS.b2gSale);
    assert.equal(teamA.farm, TEST_POINTS.b2gFarm);

    const teamB = await getTeam("Time B");
    assert.equal(teamB.sales, TEST_POINTS.b2bSale);
    assert.equal(teamB.farm, TEST_POINTS.b2bFarm);

    const salesRanking = (await getData("/ranking?vendorDepartment=sales")).vendor;
    assert.deepEqual(
      salesRanking.map(({ name, points }) => ({ name, points })),
      [
        { name: "Vendor A1", points: TEST_POINTS.b2gSale },
        { name: "Vendor B1", points: TEST_POINTS.b2bSale },
      ],
    );
  });

  it("passagem vale pelo cargo da pessoa, não pelo Setor da venda", async () => {
    // Venda B2B com o SDR B2G: ele ganha os pontos de B2G SDR mesmo assim
    await sendSheet(
      testApp.baseUrl,
      buildSheetRow({ sector: "B2B", passages: "SDR G, SDR B, CS B, Suporte C" }),
    );

    const ranking = (await getData("/sdr-ranking")).map(({ name, points }) => ({ name, points }));
    assert.deepEqual(ranking, [
      { name: "Suporte C", points: TEST_POINTS.suporte },
      { name: "CS B", points: TEST_POINTS.cs },
      { name: "SDR G", points: TEST_POINTS.b2gSdr },
    ]);

    // Time B: SDR B + CS B. Time C: SDR G + Suporte C
    assert.equal((await getTeam("Time B")).passage, TEST_POINTS.b2bSdr + TEST_POINTS.cs);
    assert.equal((await getTeam("Time C")).passage, TEST_POINTS.b2gSdr + TEST_POINTS.suporte);
  });
});
