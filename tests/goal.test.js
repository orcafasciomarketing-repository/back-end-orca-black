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
