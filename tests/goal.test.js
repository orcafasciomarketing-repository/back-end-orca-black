const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");

// Meta não configurada: definido antes do require, porque o config lê a variável ao carregar
process.env.BLACK_FRIDAY_GOAL = "0";

const SalesService = require("../features/sale/service/salesService");
const AnalyticsService = require("../features/analytics/service/analyticsService");

describe("AnalyticsService.getGoalProgress sem meta configurada", () => {
  it("percent 0 (não divide por zero) e total continua vindo", async () => {
    mock.method(SalesService, "sumActiveValue", async () => 1500);

    const result = await AnalyticsService.getGoalProgress();

    assert.deepEqual(result, { goal: 0, total: 1500, percent: 0 });
  });
});

const { buildForecast } = require("../features/analytics/service/forecastCalculator");

const saleOn = (day, value) => ({ value, realizedAt: new Date(`${day}T03:00:00.000Z`) });
const at = (day) => new Date(`${day}T18:00:00.000Z`);

describe("meta semanal automática (weekGoal do forecast)", () => {
  it("o que faltava na segunda ÷ dias produtivos até 01/12 × dias produtivos da semana", () => {
    const { weekGoal, week } = buildForecast({
      sales: [saleOn("2026-11-04", 10000), saleOn("2026-11-10", 5000)],
      goal: 200000,
      now: at("2026-11-11"),
    });

    assert.deepEqual(weekGoal, {
      goal: 60000,
      sold: 5000,
      percent: 8.33,
      remaining: 55000,
      productiveDays: 6,
      requiredPace: 18333.33,
    });
    assert.equal(week.sold, 5000);
  });

  it("não muda com as vendas da própria semana: só o que foi vendido antes da segunda conta", () => {
    const base = buildForecast({ sales: [saleOn("2026-11-04", 10000)], goal: 200000, now: at("2026-11-11") });
    const withWeekSales = buildForecast({
      sales: [saleOn("2026-11-04", 10000), saleOn("2026-11-10", 50000)],
      goal: 200000,
      now: at("2026-11-11"),
    });

    assert.equal(withWeekSales.weekGoal.goal, base.weekGoal.goal);
  });

  it("semana com feriado (20/11): 5 dias produtivos, 13 até o fim", () => {
    const { weekGoal } = buildForecast({ sales: [], goal: 190000, now: at("2026-11-18") });

    assert.equal(weekGoal.productiveDays, 5);
    assert.equal(weekGoal.goal, 73076.92);
  });

  it("última semana (30/11 e 01/12): a meta da semana é tudo o que falta", () => {
    const { weekGoal } = buildForecast({ sales: [saleOn("2026-11-10", 40000)], goal: 100000, now: at("2026-11-30") });

    assert.equal(weekGoal.goal, 60000);
    assert.equal(weekGoal.productiveDays, 2);
  });

  it("sem meta semanal antes da campanha ou sem meta configurada", () => {
    assert.equal(buildForecast({ sales: [], goal: 100000, now: at("2026-10-28") }).weekGoal, null);
    assert.equal(buildForecast({ sales: [], goal: 0, now: at("2026-11-11") }).weekGoal, null);
  });

  it("meta já batida: meta da semana 0, sem percentual nem ritmo", () => {
    const { weekGoal } = buildForecast({ sales: [saleOn("2026-11-04", 300000)], goal: 200000, now: at("2026-11-11") });

    assert.deepEqual(weekGoal, {
      goal: 0,
      sold: 0,
      percent: null,
      remaining: 0,
      productiveDays: 6,
      requiredPace: 0,
    });
  });
});

