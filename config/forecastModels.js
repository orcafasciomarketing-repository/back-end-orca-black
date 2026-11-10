// Modelos de forecast por setor. Cada setor usa o seu: pesos do ritmo (médias dos últimos 7 e 30 dias
// produtivos e da campanha/mês) e fatores dos cenários (pessimista, realista, otimista).
//
// B2B: fórmulas do forecast_automatico_crm.pdf (as de config/campaign.js).
// B2G: ainda não mandou as fórmulas, então usa o modelo do B2B (`basedOn: "b2b"`). Quando chegarem,
// é só trocar o modelo do B2G aqui (e, se a fórmula mudar de formato, o cálculo em forecastCalculator.js).
const { PACE_WEIGHTS, SCENARIO_FACTORS } = require("./campaign");

const B2B_MODEL = {
  key: "b2b",
  label: "Forecast B2B",
  basedOn: null,
  paceWeights: PACE_WEIGHTS,
  scenarioFactors: SCENARIO_FACTORS,
};

const B2G_MODEL = {
  ...B2B_MODEL,
  key: "b2g",
  label: "Forecast B2G (provisório: fórmulas do B2B)",
  basedOn: "b2b",
};

const FORECAST_MODELS = { b2b: B2B_MODEL, b2g: B2G_MODEL };

// Venda sem setor usa o modelo do B2B
const forecastModelOf = (segment) => FORECAST_MODELS[segment] ?? B2B_MODEL;

module.exports = { FORECAST_MODELS, forecastModelOf };
