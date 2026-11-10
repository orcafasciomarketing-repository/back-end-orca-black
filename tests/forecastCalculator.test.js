const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildForecast,
  combineForecasts,
  normalCdf,
  isProductiveDay,
} = require("../features/analytics/service/forecastCalculator");
const { FORECAST_MODELS, forecastModelOf } = require("../config/forecastModels");

// Campanha de 03/11 a 01/12/2026 (config/campaign.js). Dias produtivos: segunda a sábado,
// sem o feriado de 20/11 → 24 dias no total
//
// Novembro/2026: dia 1 é domingo. Domingos: 1, 8, 15, 22, 29. Feriado: 20 (sexta)

// Venda à meia-noite de São Paulo do dia (como a planilha manda)
const sale = (day, value) => ({ value, realizedAt: new Date(`${day}T03:00:00.000Z`) });
// "Agora" às 15h de São Paulo do dia
const at = (day) => new Date(`${day}T18:00:00.000Z`);

describe("forecastCalculator", () => {
  describe("dias produtivos", () => {
    it("segunda a sábado contam; domingo e feriado não", () => {
      assert.equal(isProductiveDay("2026-11-14"), true); // sábado
      assert.equal(isProductiveDay("2026-11-16"), true); // segunda
      assert.equal(isProductiveDay("2026-11-15"), false); // domingo
      assert.equal(isProductiveDay("2026-11-20"), false); // feriado (sexta)
    });

    it("a campanha inteira tem 24 dias produtivos", () => {
      const { campaign } = buildForecast({ sales: [], goal: 1000, now: at("2026-11-01") });

      assert.deepEqual(campaign.productiveDays, { elapsed: 0, remaining: 24 });
    });
  });

  describe("fórmulas do PDF, com ritmo constante (as 3 médias iguais)", () => {
    // Hoje 04/11 (quarta): passaram 03 e 04 (2 dias); faltam 05/11 a 01/12 = 22 dias
    const forecast = buildForecast({
      sales: [sale("2026-11-03", 39248), sale("2026-11-04", 39248)],
      goal: 3000000,
      now: at("2026-11-04"),
    });
    const { campaign } = forecast;

    it("vendido, dias e ritmo", () => {
      assert.equal(campaign.sold, 78496);
      assert.deepEqual(campaign.productiveDays, { elapsed: 2, remaining: 22 });
      assert.equal(campaign.pace.current, 39248);
    });

    it("cenários: vendido + ritmo x fator x dias que faltam", () => {
      assert.deepEqual(campaign.scenarios, {
        pessimistic: 78496 + 39248 * 0.8 * 22, // 769.260,80
        realistic: 78496 + 39248 * 22, // 941.952,00
        optimistic: 78496 + 39248 * 1.2 * 22, // 1.114.643,20
      });
    });

    it("ritmo necessário, cobertura e gap", () => {
      // (3.000.000 - 78.496) / 22 = 132.795,64 por dia
      assert.equal(campaign.requiredPace, 132795.64);
      // 39.248 / 132.795,64 = 29,56% (não é a chance de bater a meta)
      assert.equal(campaign.paceCoverage, 29.56);
      assert.equal(campaign.gap, 3000000 - 941952);
    });

    it("todo dia igual (desvio 0) e realista abaixo da meta → probabilidade 0", () => {
      assert.equal(campaign.dailyStdDev, 0);
      assert.equal(campaign.probability, 0);
    });
  });

  describe("ritmo ponderado (7 dias 50%, 30 dias 30%, campanha 20%)", () => {
    // Hoje 14/11 (sábado): 11 dias produtivos (03 a 07 e 09 a 14). Dia N da campanha vende N x 1.000
    const days = ["03", "04", "05", "06", "07", "09", "10", "11", "12", "13", "14"].map((day) => `2026-11-${day}`);
    const sales = days.map((day, index) => sale(day, (index + 1) * 1000));
    const forecast = buildForecast({ sales, goal: 200000, now: at("2026-11-14") });
    const { campaign } = forecast;

    it("as três médias e o ritmo", () => {
      // últimos 7: (5+6+...+11) x 1.000 / 7 = 8.000; 30 dias e campanha: 66.000 / 11 = 6.000
      assert.deepEqual(
        { last7: campaign.pace.last7, last30: campaign.pace.last30, campaign: campaign.pace.campaign },
        { last7: 8000, last30: 6000, campaign: 6000 },
      );
      // 8.000 x 0,5 + 6.000 x 0,3 + 6.000 x 0,2 = 7.000
      assert.equal(campaign.pace.current, 7000);
    });

    it("realista: 66.000 + 7.000 x 13 dias (16/11 a 01/12, sem domingos e sem 20/11)", () => {
      assert.equal(campaign.productiveDays.remaining, 13);
      assert.equal(campaign.scenarios.realistic, 66000 + 7000 * 13);
    });

    it("probabilidade pela normal: z = (meta - realista) / (desvio x raiz(dias))", () => {
      // desvio amostral de 1.000, 2.000, ..., 11.000 = 3.316,62
      const stdDev = Math.sqrt(110000000 / 10);
      const z = (200000 - 157000) / (stdDev * Math.sqrt(13));
      const expected = Math.round((1 - normalCdf(z)) * 10000) / 100;

      assert.equal(campaign.dailyStdDev, Math.round(stdDev * 100) / 100);
      assert.equal(campaign.probability, expected);
      assert.ok(campaign.probability > 0 && campaign.probability < 1, String(campaign.probability));
    });

    it("gráfico: realizado acumulado até hoje e os 3 cenários a partir de hoje", () => {
      const { trajectory } = forecast;

      assert.equal(trajectory.days.length, 24);
      assert.equal(trajectory.days[10], "2026-11-14");
      assert.equal(trajectory.actual[10], 66000);
      assert.equal(trajectory.actual[11], null);
      assert.equal(trajectory.realistic[9], null);
      assert.equal(trajectory.realistic[10], 66000);
      assert.equal(trajectory.realistic.at(-1), 157000);
      assert.equal(trajectory.pessimistic.at(-1), 66000 + 7000 * 0.8 * 13);
      assert.equal(trajectory.optimistic.at(-1), 66000 + 7000 * 1.2 * 13);
    });

    it("semana (segunda 09 a sábado 14), já no último dia: os cenários são o vendido", () => {
      // 6 + 7 + 8 + 9 + 10 + 11 = 51 mil
      assert.deepEqual(forecast.week, {
        start: "2026-11-09",
        end: "2026-11-14",
        sold: 51000,
        remainingDays: 0,
        scenarios: { pessimistic: 51000, realistic: 51000, optimistic: 51000 },
      });
    });
  });

  it("dias sem venda entram como R$ 0 nas médias", () => {
    // Hoje 05/11: 3 dias, só o primeiro vendeu
    const { campaign } = buildForecast({ sales: [sale("2026-11-03", 9000)], goal: 100000, now: at("2026-11-05") });

    assert.equal(campaign.pace.campaign, 3000);
    assert.equal(campaign.pace.current, 3000);
  });

  it("venda no domingo ou feriado conta no dia produtivo anterior", () => {
    const { trajectory } = buildForecast({
      sales: [sale("2026-11-07", 1000), sale("2026-11-08", 500), sale("2026-11-20", 300)],
      goal: 100000,
      now: at("2026-11-21"),
    });
    const actualOn = (day) => trajectory.actual[trajectory.days.indexOf(day)];

    assert.equal(trajectory.days.includes("2026-11-08"), false);
    assert.equal(trajectory.days.includes("2026-11-20"), false);
    assert.equal(actualOn("2026-11-07"), 1500);
    assert.equal(actualOn("2026-11-19"), 1800);
  });

  it("venda antes de 03/11 conta no vendido (e na meta), mas não no ritmo", () => {
    const { campaign, trajectory } = buildForecast({
      sales: [sale("2026-10-30", 5000), sale("2026-11-03", 1000)],
      goal: 100000,
      now: at("2026-11-03"),
    });

    assert.equal(campaign.sold, 6000);
    assert.equal(campaign.pace.current, 1000);
    assert.equal(trajectory.actual[0], 6000);
  });

  it("semana com feriado: quarta 18/11 → faltam 19 e 21 (o 20/11 não conta)", () => {
    const { week } = buildForecast({ sales: [sale("2026-11-16", 1000)], goal: 100000, now: at("2026-11-18") });

    assert.equal(week.start, "2026-11-16");
    assert.equal(week.end, "2026-11-21");
    assert.equal(week.remainingDays, 2);
  });

  it("antes da campanha: ritmo 0, cenários = vendido, sem probabilidade", () => {
    const { campaign } = buildForecast({ sales: [], goal: 100000, now: at("2026-11-01") });

    assert.equal(campaign.pace.current, 0);
    assert.deepEqual(campaign.scenarios, { pessimistic: 0, realistic: 0, optimistic: 0 });
    assert.equal(campaign.probability, null);
  });

  it("meta já batida: probabilidade 100%, ritmo necessário 0, sem cobertura", () => {
    const { campaign } = buildForecast({ sales: [sale("2026-11-03", 150000)], goal: 100000, now: at("2026-11-04") });

    assert.equal(campaign.probability, 100);
    assert.equal(campaign.requiredPace, 0);
    assert.equal(campaign.paceCoverage, null);
  });

  it("depois do fim (01/12): nenhum dia restante; sem bater a meta → probabilidade 0", () => {
    const { campaign, week } = buildForecast({ sales: [sale("2026-11-03", 1000)], goal: 100000, now: at("2026-12-05") });

    assert.equal(campaign.productiveDays.remaining, 0);
    assert.equal(campaign.requiredPace, null);
    assert.equal(campaign.probability, 0);
    assert.equal(week.remainingDays, 0);
  });

  it("normalCdf bate com a tabela da normal", () => {
    assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-7);
    assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-4);
    assert.ok(Math.abs(normalCdf(-1) - 0.158655) < 1e-5);
  });

  describe("um modelo por setor", () => {
    it("B2B usa as fórmulas do PDF; B2G, por enquanto, as mesmas do B2B; venda sem setor usa o B2B", () => {
      assert.deepEqual(FORECAST_MODELS.b2b.paceWeights, { last7: 0.5, last30: 0.3, campaign: 0.2 });
      assert.equal(FORECAST_MODELS.b2g.basedOn, "b2b");
      assert.deepEqual(FORECAST_MODELS.b2g.paceWeights, FORECAST_MODELS.b2b.paceWeights);
      assert.deepEqual(FORECAST_MODELS.b2g.scenarioFactors, FORECAST_MODELS.b2b.scenarioFactors);
      assert.equal(forecastModelOf(null).key, "b2b");
    });

    it("o cálculo usa os pesos e os fatores do modelo recebido", () => {
      const model = {
        ...FORECAST_MODELS.b2b,
        key: "teste",
        paceWeights: { last7: 1, last30: 0, campaign: 0 },
        scenarioFactors: { pessimistic: 0.5, realistic: 1, optimistic: 2 },
      };
      const sales = [sale("2026-11-03", 1000), sale("2026-11-04", 3000)];
      const forecast = buildForecast({ sales, goal: 100000, now: at("2026-11-04"), model });

      assert.equal(forecast.model.key, "teste");
      assert.equal(forecast.campaign.pace.current, 2000);
      assert.deepEqual(forecast.campaign.scenarios, { pessimistic: 26000, realistic: 48000, optimistic: 92000 });
    });

    it("total = soma dos setores; com os mesmos modelos dá o mesmo que calcular tudo junto", () => {
      const b2b = [sale("2026-11-03", 39248), sale("2026-11-05", 10000)];
      const b2g = [sale("2026-11-04", 20000), sale("2026-11-06", 5000)];
      const now = at("2026-11-06");
      const together = buildForecast({ sales: [...b2b, ...b2g], goal: 300000, now });
      const combined = combineForecasts({
        total: together,
        parts: [
          buildForecast({ sales: b2b, goal: 0, now, model: forecastModelOf("b2b") }),
          buildForecast({ sales: b2g, goal: 0, now, model: forecastModelOf("b2g") }),
        ],
        goal: 300000,
      });

      assert.equal(combined.model.key, "total");
      assert.deepEqual(
        combined.model.parts.map((part) => [part.key, part.basedOn]),
        [
          ["b2b", null],
          ["b2g", "b2b"],
        ],
      );
      assert.equal(combined.campaign.pace.current, together.campaign.pace.current);
      assert.deepEqual(combined.campaign.scenarios, together.campaign.scenarios);
      assert.equal(combined.campaign.probability, together.campaign.probability);
      assert.deepEqual(combined.trajectory.realistic, together.trajectory.realistic);
      assert.deepEqual(combined.campaign.pace.weights, together.campaign.pace.weights);
    });

    it("com modelos diferentes, o total soma os cenários de cada um e fica sem peso único", () => {
      const now = at("2026-11-06");
      const other = {
        ...FORECAST_MODELS.b2b,
        key: "b2g",
        paceWeights: { last7: 1, last30: 0, campaign: 0 },
        scenarioFactors: { pessimistic: 1, realistic: 1, optimistic: 1 },
      };
      const parts = [
        buildForecast({ sales: [sale("2026-11-03", 10000)], goal: 0, now }),
        buildForecast({ sales: [sale("2026-11-04", 6000)], goal: 0, now, model: other }),
      ];
      const combined = combineForecasts({
        total: buildForecast({ sales: [sale("2026-11-03", 10000), sale("2026-11-04", 6000)], goal: 100000, now }),
        parts,
        goal: 100000,
      });

      assert.equal(
        combined.campaign.scenarios.realistic,
        parts[0].campaign.scenarios.realistic + parts[1].campaign.scenarios.realistic,
      );
      assert.equal(combined.campaign.pace.weights, null);
      assert.equal(combined.campaign.gap, 100000 - combined.campaign.scenarios.realistic);
    });
  });
});
