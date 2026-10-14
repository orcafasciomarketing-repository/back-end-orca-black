const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp, seedBase, clearDatabase, TEST_GOAL } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");

const DAY_MS = 24 * 60 * 60 * 1000;

// Segunda-feira 00:00 da semana atual em São Paulo, calculada de outro jeito
// (com Intl) para conferir o cálculo do service de forma independente.
const getSaoPauloMonday = () => {
  const todayInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date()); // "AAAA-MM-DD"

  const weekDay = new Date(`${todayInSaoPaulo}T12:00:00Z`).getUTCDay() || 7;
  const midnightToday = new Date(`${todayInSaoPaulo}T00:00:00-03:00`);

  return new Date(midnightToday.getTime() - (weekDay - 1) * DAY_MS);
};

// Pontos dos testes (tests/helpers/testApp.js): sales = 3, farm = 2, passage = 1
//
// Venda | vendor | tipo  | status    | quando                               | passagem
// s1    | A1     | sales | ativa     | segunda 00:00 (início da semana)     | -
// s2    | A1     | farm  | ativa     | domingo 23:59:59.999 (fim da semana) | SDR B (time B)
// s3    | B1     | sales | ativa     | 1ms antes da semana (semana passada) | Suporte C (time C)
// s4    | A2     | sales | cancelada | semana atual                         | Suporte C
// s5    | A2     | farm  | ativa     | 2 semanas atrás                      | -
// s6    | C1     | sales | ativa     | 2 semanas atrás                      | Suporte C
// s7    | C1     | sales | ativa     | 2 semanas atrás                      | -
// s8    | A2     | sales | ativa     | 2 semanas atrás                      | -
describe("Analytics", () => {
  let testApp;
  let seed;

  before(async () => {
    testApp = await startTestApp();
    await clearDatabase();
    seed = await seedBase();

    const weekStart = getSaoPauloMonday();
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
    const lastWeek = new Date(weekStart.getTime() - 1);
    const twoWeeksAgo = new Date(weekStart.getTime() - 14 * DAY_MS);

    const buildSale = (rdDealId, vendor, funnelType, realizedAt, extra = {}) => ({
      rdDealId,
      vendorId: vendor._id,
      value: 1000,
      rdUpdatedAt: realizedAt,
      segment: "b2b",
      funnelType,
      realizedAt,
      dealStatus: "ativa",
      ...extra,
    });

    await Sales.create([
      buildSale("s1", seed.vendorA1, "sales", weekStart),
      buildSale("s2", seed.vendorA1, "farm", weekEnd, { sdrId: seed.sdrB._id }),
      buildSale("s3", seed.vendorB1, "sales", lastWeek, { sdrId: seed.sdrC._id }),
      buildSale("s4", seed.vendorA2, "sales", new Date(weekStart.getTime() + DAY_MS), {
        dealStatus: "cancelada",
        sdrId: seed.sdrC._id,
      }),
      buildSale("s5", seed.vendorA2, "farm", twoWeeksAgo),
      buildSale("s6", seed.vendorC1, "sales", twoWeeksAgo, { sdrId: seed.sdrC._id }),
      buildSale("s7", seed.vendorC1, "sales", twoWeeksAgo),
      buildSale("s8", seed.vendorA2, "sales", twoWeeksAgo),
    ]);
  });

  after(async () => {
    await testApp.stop();
  });

  const getData = async (path) => {
    const res = await fetch(`${testApp.baseUrl}/analytics${path}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    return body.data;
  };

  // Deixa só os campos que importam para comparar o placar
  const summarizeScoreboard = (teams) =>
    teams.map(({ teamName, sales, farm, passage, total }) => ({
      teamName,
      sales,
      farm,
      passage,
      total,
    }));

  describe("meta da Black (/goal)", () => {
    it("devolve a meta, o total vendido (só ativas, campanha toda) e o percentual já calculado", async () => {
      const data = await getData("/goal");

      // 7 vendas ativas de 1000 (s4 cancelada não conta), meta de teste 9000
      assert.deepEqual(data, { goal: TEST_GOAL, total: 7000, percent: 77.78 });
    });
  });

  describe("placar de equipes (/scoreboard)", () => {
    it("geral: soma vendas, renovações e passagens de todas as vendas ativas", async () => {
      const data = await getData("/scoreboard");

      assert.deepEqual(summarizeScoreboard(data), [
        // A: s1 + s8 (sales 3+3), s2 + s5 (farm 2+2)
        { teamName: "Time A", sales: 6, farm: 4, passage: 0, total: 10 },
        // C: s6 + s7 (sales 3+3), passagens de s3 e s6 (1+1). s4 cancelada não conta
        { teamName: "Time C", sales: 6, farm: 0, passage: 2, total: 8 },
        // B: s3 (sales 3), passagem de s2 (1)
        { teamName: "Time B", sales: 3, farm: 0, passage: 1, total: 4 },
      ]);
    });

    it("semana: só vendas da semana atual, incluindo a primeira e a última milésima", async () => {
      const data = await getData("/scoreboard?period=week");

      assert.deepEqual(summarizeScoreboard(data), [
        { teamName: "Time A", sales: 3, farm: 2, passage: 0, total: 5 },
        // a passagem de s2 vai para o time de quem fez (SDR B), não do vendor (time A)
        { teamName: "Time B", sales: 0, farm: 0, passage: 1, total: 1 },
        // time sem pontos também aparece
        { teamName: "Time C", sales: 0, farm: 0, passage: 0, total: 0 },
      ]);
    });

    it("semana passada (/scoreboard/last-week)", async () => {
      const data = await getData("/scoreboard/last-week");

      assert.deepEqual(summarizeScoreboard(data), [
        { teamName: "Time B", sales: 3, farm: 0, passage: 0, total: 3 },
        { teamName: "Time C", sales: 0, farm: 0, passage: 1, total: 1 },
        { teamName: "Time A", sales: 0, farm: 0, passage: 0, total: 0 },
      ]);
    });

    it("cada time traz teamId e o escudo (teamShirt)", async () => {
      const data = await getData("/scoreboard");
      const teamA = data.find((team) => team.teamName === "Time A");

      assert.equal(teamA.teamId, seed.teamA._id.toString());
      assert.equal(teamA.teamShirt, seed.teamA.imageUrl);
    });
  });

  describe("artilheiros (/ranking)", () => {
    const summarizeRanking = (data) =>
      data.vendor.map(({ name, points }) => ({ name, points }));

    it("vendas, geral: top 3 por pontos só de vendas sales (s4 cancelada não conta)", async () => {
      const data = await getData("/ranking");
      const ranking = summarizeRanking(data);

      assert.equal(ranking.length, 3);
      assert.deepEqual(ranking[0], { name: "Vendor C1", points: 6 });
      // A1, B1 e A2 têm 3 pontos cada; sem desempate, entram 2 deles em qualquer ordem
      for (const vendor of ranking.slice(1)) {
        assert.ok(["Vendor A1", "Vendor B1", "Vendor A2"].includes(vendor.name));
        assert.equal(vendor.points, 3);
      }
    });

    it("farmer, geral: só vendas farm (vendorDepartment=farm)", async () => {
      const data = await getData("/ranking?vendorDepartment=farm");
      const names = summarizeRanking(data).map((vendor) => vendor.name).sort();

      assert.deepEqual(names, ["Vendor A1", "Vendor A2"]);
      for (const vendor of data.vendor) assert.equal(vendor.points, 2);
    });

    it("separa pelo funnelType da venda: Vendor A1 aparece nos dois rankings", async () => {
      const sales = await getData("/ranking?period=week");
      const farm = await getData("/ranking?period=week&vendorDepartment=farm");

      assert.deepEqual(summarizeRanking(sales), [{ name: "Vendor A1", points: 3 }]);
      assert.deepEqual(summarizeRanking(farm), [{ name: "Vendor A1", points: 2 }]);
    });

    it("semana passada (/ranking/last-week)", async () => {
      const data = await getData("/ranking/last-week");

      assert.deepEqual(summarizeRanking(data), [{ name: "Vendor B1", points: 3 }]);
    });
  });

  describe("ranking de passagens (/sdr-ranking)", () => {
    const summarizeSdr = (data) => data.map(({ name, goals }) => ({ name, goals }));

    it("geral: conta passagens de SDR e de Suporte (s4 cancelada não conta)", async () => {
      const data = await getData("/sdr-ranking");

      assert.deepEqual(summarizeSdr(data), [
        { name: "Suporte C", goals: 2 },
        { name: "SDR B", goals: 1 },
      ]);
    });

    it("semana", async () => {
      const data = await getData("/sdr-ranking?period=week");

      assert.deepEqual(summarizeSdr(data), [{ name: "SDR B", goals: 1 }]);
    });

    it("semana passada (/sdr-ranking/last-week)", async () => {
      const data = await getData("/sdr-ranking/last-week");

      assert.deepEqual(summarizeSdr(data), [{ name: "Suporte C", goals: 1 }]);
    });
  });
});
