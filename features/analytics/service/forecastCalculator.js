// Cálculo do forecast (ver forecast_automatico_crm.pdf). Funções puras: recebem as
// vendas já buscadas e o "agora", então dá para testar cada fórmula com números exatos.
const {
  CAMPAIGN_START_DAY,
  CAMPAIGN_END_DAY,
  HOLIDAYS,
  PACE_WEIGHTS,
  SCENARIO_FACTORS,
} = require("../../../config/campaign");

// O Brasil não tem mais horário de verão: São Paulo é sempre UTC-3
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

// Dia (AAAA-MM-DD) de uma data no horário de São Paulo
const dayKeyOf = (date) => new Date(new Date(date).getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (day, amount) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

const weekDayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

// Dia produtivo: segunda a sábado, sem feriado
const isProductiveDay = (day) => weekDayOf(day) !== 0 && !HOLIDAYS.includes(day);

// Dias produtivos de from até to (os dois inclusive)
const productiveDaysBetween = (from, to) => {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (isProductiveDay(day)) days.push(day);
  }
  return days;
};

const sum = (values) => values.reduce((total, value) => total + value, 0);
const average = (values) => (values.length ? sum(values) / values.length : 0);
const roundMoney = (value) => Math.round(value * 100) / 100;
const roundPercent = (ratio) => Math.round(ratio * 10000) / 100;

// Desvio padrão amostral; com menos de 2 dias não dá para calcular
const standardDeviation = (values) => {
  if (values.length < 2) return null;
  const mean = average(values);
  return Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
};

// Distribuição normal acumulada (aproximação de Abramowitz e Stegun, erro < 0,0000002)
const normalCdf = (x) => {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-((x * x) / 2));
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
};

// Venda em domingo ou feriado entra no dia produtivo anterior (ou no primeiro, se for antes dele)
const productiveDayFor = (day, productiveDays) => {
  let chosen = productiveDays[0];
  for (const productiveDay of productiveDays) {
    if (productiveDay > day) break;
    chosen = productiveDay;
  }
  return chosen;
};

const buildScenarios = (sold, pace, days) =>
  Object.fromEntries(
    Object.entries(SCENARIO_FACTORS).map(([name, factor]) => [name, roundMoney(sold + pace * factor * days)]),
  );

// Chance de bater a meta: z = (meta - realista) / (desvio diário x raiz(dias que faltam))
const goalProbability = ({ sold, goal, realistic, stdDev, daysLeft }) => {
  if (goal <= 0) return null;
  if (sold >= goal) return 1;
  if (daysLeft === 0) return 0;
  if (stdDev === null) return null;
  if (stdDev === 0) return realistic >= goal ? 1 : 0;

  const z = (goal - realistic) / (stdDev * Math.sqrt(daysLeft));
  return 1 - normalCdf(z);
};

// sales: vendas ativas ({ value, realizedAt }); goal: meta do período da campanha
exports.buildForecast = ({ sales, goal, now = new Date() }) => {
  const today = dayKeyOf(now);
  const hasStarted = today >= CAMPAIGN_START_DAY;
  const lastElapsedDay = today < CAMPAIGN_END_DAY ? today : CAMPAIGN_END_DAY;

  // Hoje conta como dia já passado (as vendas de hoje já estão no vendido)
  const elapsedDays = hasStarted ? productiveDaysBetween(CAMPAIGN_START_DAY, lastElapsedDay) : [];
  const remainingDays = productiveDaysBetween(hasStarted ? addDays(today, 1) : CAMPAIGN_START_DAY, CAMPAIGN_END_DAY);

  const sold = sum(sales.map((sale) => sale.value ?? 0));

  // Vendido em cada dia produtivo da campanha, inclusive os dias com R$ 0
  const soldByDay = new Map(elapsedDays.map((day) => [day, 0]));
  for (const sale of sales) {
    const day = dayKeyOf(sale.realizedAt);
    if (!elapsedDays.length || day < CAMPAIGN_START_DAY || day > lastElapsedDay) continue;
    const productiveDay = productiveDayFor(day, elapsedDays);
    soldByDay.set(productiveDay, soldByDay.get(productiveDay) + (sale.value ?? 0));
  }
  const dailyValues = elapsedDays.map((day) => soldByDay.get(day));

  const averages = {
    last7: average(dailyValues.slice(-7)),
    last30: average(dailyValues.slice(-30)),
    campaign: average(dailyValues),
  };
  const pace = sum(Object.keys(PACE_WEIGHTS).map((key) => averages[key] * PACE_WEIGHTS[key]));

  const daysLeft = remainingDays.length;
  const scenarios = buildScenarios(sold, pace, daysLeft);
  const remainingToGoal = Math.max(goal - sold, 0);
  const requiredPace = daysLeft > 0 ? remainingToGoal / daysLeft : null;
  const stdDev = standardDeviation(dailyValues.slice(-30));
  const probability = goalProbability({ sold, goal, realistic: scenarios.realistic, stdDev, daysLeft });

  // Gráfico: realizado acumulado nos dias que passaram e, de hoje em diante, os 3 cenários.
  // O acumulado começa no que foi vendido fora dos dias da campanha (antes de 03/11, por exemplo)
  let cumulative = sold - sum(dailyValues);
  const actual = dailyValues.map((value) => roundMoney((cumulative += value)));
  const projectionFor = (factor) => [
    ...elapsedDays.map((_, index) => (index === elapsedDays.length - 1 ? roundMoney(sold) : null)),
    ...remainingDays.map((_, index) => roundMoney(sold + pace * factor * (index + 1))),
  ];

  // Semana atual (segunda a sábado), sem meta: só os cenários
  const weekStart = addDays(today, -((weekDayOf(today) || 7) - 1));
  const weekSunday = addDays(weekStart, 6);
  const weekEnd = addDays(weekStart, 5) < CAMPAIGN_END_DAY ? addDays(weekStart, 5) : CAMPAIGN_END_DAY;
  const weekSold = sum(
    sales
      .filter((sale) => {
        const day = dayKeyOf(sale.realizedAt);
        return day >= weekStart && day <= weekSunday;
      })
      .map((sale) => sale.value ?? 0),
  );
  const weekDaysLeft = today < weekEnd ? productiveDaysBetween(addDays(today, 1), weekEnd).length : 0;

  return {
    today,
    goal,
    campaign: {
      start: CAMPAIGN_START_DAY,
      end: CAMPAIGN_END_DAY,
      sold: roundMoney(sold),
      productiveDays: { elapsed: elapsedDays.length, remaining: daysLeft },
      pace: {
        current: roundMoney(pace),
        last7: roundMoney(averages.last7),
        last30: roundMoney(averages.last30),
        campaign: roundMoney(averages.campaign),
        weights: PACE_WEIGHTS,
      },
      scenarios,
      requiredPace: requiredPace === null ? null : roundMoney(requiredPace),
      paceCoverage: requiredPace ? roundPercent(pace / requiredPace) : null,
      gap: roundMoney(goal - scenarios.realistic),
      dailyStdDev: stdDev === null ? null : roundMoney(stdDev),
      probability: probability === null ? null : roundPercent(probability),
    },
    week: {
      start: weekStart,
      end: weekEnd,
      sold: roundMoney(weekSold),
      remainingDays: weekDaysLeft,
      scenarios: buildScenarios(weekSold, pace, weekDaysLeft),
    },
    trajectory: {
      days: [...elapsedDays, ...remainingDays],
      actual: [...actual, ...remainingDays.map(() => null)],
      pessimistic: projectionFor(SCENARIO_FACTORS.pessimistic),
      realistic: projectionFor(SCENARIO_FACTORS.realistic),
      optimistic: projectionFor(SCENARIO_FACTORS.optimistic),
    },
  };
};

exports.normalCdf = normalCdf;
exports.isProductiveDay = isProductiveDay;
