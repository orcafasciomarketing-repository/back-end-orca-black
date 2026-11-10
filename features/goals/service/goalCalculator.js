// Cálculo das metas mensais. Funções puras (sem banco), para testar as regras com números exatos.
//
// Regras:
// - a semana vai de segunda a domingo e pertence ao mês da segunda-feira;
// - o mês da meta são as semanas que começam nele (soma das semanas = mês);
// - valores em reais, comparados em centavos para a soma sempre fechar;
// - o gestor define cada parte do setor em R$: Meta de renovação (Farmer) e de vendas, e no mês da
//   campanha a Meta black de cada uma. A Super de cada parte é a Meta dela × superPercent%;
// - Super e Black descem para as pessoas da parte na proporção da Meta de cada uma (que vem dos pesos
//   de senioridade) e para as semanas na proporção da Meta de cada semana.

const { forecastModelOf } = require("../../../config/forecastModels");
const { isProductiveDay, normalCdf } = require("../../analytics/service/forecastCalculator");

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const TIERS = ["goal", "super", "black"];

const dayKeyOf = (date) => new Date(new Date(date).getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (day, amount) => new Date(new Date(`${day}T00:00:00Z`).getTime() + amount * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);

// Meia-noite de São Paulo do dia (AAAA-MM-DD) em UTC
const startOfDay = (day) => new Date(`${day}T03:00:00.000Z`);

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;

// Semanas que começam no mês (AAAA-MM)
const monthWeeks = (month) => {
  const first = `${month}-01`;
  const weekDay = new Date(`${first}T00:00:00Z`).getUTCDay();
  let start = addDays(first, (8 - (weekDay || 7)) % 7);
  const weeks = [];
  while (start.slice(0, 7) === month) {
    weeks.push({ index: weeks.length, start, end: addDays(start, 6) });
    start = addDays(start, 7);
  }
  return weeks;
};

// Dias cobertos pelas semanas do mês (do início da 1ª semana ao fim da última)
const monthDays = (weeks) => {
  if (!weeks.length) return [];
  const total = daysBetween(weeks[0].start, weeks[weeks.length - 1].end) + 1;
  return Array.from({ length: total }, (_, index) => addDays(weeks[0].start, index));
};

// Divide centavos pelos pesos; a sobra do arredondamento vai para quem teve a maior fração
const distributeByWeight = (totalCents, items) => {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (!items.length || totalWeight <= 0) return new Map(items.map((item) => [item.key, 0]));

  const shares = items.map((item) => {
    const exact = (totalCents * item.weight) / totalWeight;
    return { key: item.key, cents: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let rest = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);
  [...shares].sort((a, b) => b.fraction - a.fraction).forEach((share) => {
    if (rest > 0) {
      share.cents += 1;
      rest -= 1;
    }
  });
  return new Map(shares.map((share) => [share.key, share.cents]));
};

// Divide igual; a sobra fica nas primeiras partes (1 centavo cada)
const splitEqually = (totalCents, parts) => {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const rest = totalCents - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < rest ? 1 : 0));
};

const TYPES = ["farm", "sales"];

// Meta de cada parte do setor (renovação e vendas), como o gestor digitou
const segmentParts = ({ farmGoal, salesGoal }) => ({
  farm: fromCents(toCents(farmGoal)),
  sales: fromCents(toCents(salesGoal)),
});

// Faixas de cada parte: Meta digitada, Super = Meta × superPercent% e Black digitada (só no mês da campanha)
const typeTiers = (config, withBlack = false) => {
  const parts = segmentParts(config);
  const black = { farm: withBlack ? config.farmBlack ?? 0 : 0, sales: withBlack ? config.salesBlack ?? 0 : 0 };
  return Object.fromEntries(
    TYPES.map((type) => [
      type,
      {
        goal: parts[type],
        super: fromCents(Math.round((toCents(parts[type]) * config.superPercent) / 100)),
        black: fromCents(toCents(black[type])),
      },
    ]),
  );
};

// Faixas do setor: soma das duas partes
const segmentTiers = (byType) => sumTiers(TYPES.map((type) => byType[type]));

// Reparte centavos na proporção de outros valores (em centavos); sem proporção, divide igual
const shareLike = (totalCents, keys, weightsCents) => {
  const hasWeight = weightsCents.some((value) => value > 0);
  return distributeByWeight(
    totalCents,
    keys.map((key, index) => ({ key, weight: hasWeight ? weightsCents[index] : 1 })),
  );
};

// Faixas de cada pessoa: a Meta é a dela; a Super e a Black da parte dela (renovação ou vendas) são
// divididas entre as pessoas da parte na proporção do valor salvo de cada uma (superGoal/blackGoal) ou,
// sem valor salvo, na proporção da Meta. Com os valores salvos, cada pessoa fica com exatamente o que foi cadastrado
const peopleTiers = (people, byType) => {
  const result = new Map(people.map((person) => [String(person.vendorId), { goal: fromCents(toCents(person.goal)), super: 0, black: 0 }]));
  for (const tier of ["super", "black"]) {
    for (const type of TYPES) {
      const members = people.filter((person) => person.type === type);
      const field = `${tier}Goal`;
      const saved = members.length > 0 && members.every((person) => person[field] != null);
      const shares = shareLike(
        toCents(byType[type][tier]),
        members.map((person) => String(person.vendorId)),
        members.map((person) => toCents(saved ? person[field] : person.goal)),
      );
      shares.forEach((cents, key) => {
        result.get(key)[tier] = fromCents(cents);
      });
    }
  }
  return result;
};

// Faixas de cada semana da pessoa: a Meta é a da semana; a Super e a Black seguem a proporção da Meta semanal
const weekTiers = (personTiers, weekGoals) => {
  const keys = weekGoals.map((_, index) => index);
  const weights = weekGoals.map(toCents);
  const superShares = shareLike(toCents(personTiers.super), keys, weights);
  const blackShares = shareLike(toCents(personTiers.black), keys, weights);
  return weekGoals.map((value, index) => ({
    goal: fromCents(toCents(value)),
    super: fromCents(superShares.get(index)),
    black: fromCents(blackShares.get(index)),
  }));
};

const sumTiers = (list) =>
  list.reduce(
    (sum, tiers) => ({
      goal: fromCents(toCents(sum.goal) + toCents(tiers.goal)),
      super: fromCents(toCents(sum.super) + toCents(tiers.super)),
      black: fromCents(toCents(sum.black) + toCents(tiers.black)),
    }),
    { goal: 0, super: 0, black: 0 },
  );

const round1 = (value) => Math.round(value * 10) / 10;

// Faixa atual: a primeira ainda não batida (fora do mês da campanha não tem Meta black).
// Bateu todas: fica na última, e o que passar dela é excedente
const tierProgress = (realized, tiers) => {
  const available = TIERS.filter((tier) => tiers[tier] > 0);
  const last = available[available.length - 1] ?? "goal";
  const reached = available.filter((tier) => realized >= tiers[tier]);
  const current = available.find((tier) => !reached.includes(tier)) ?? last;
  const target = tiers[current];

  return {
    realized: fromCents(toCents(realized)),
    tiers,
    reached,
    current,
    target,
    percent: target > 0 ? round1((realized / target) * 100) : 0,
    remaining: fromCents(Math.max(toCents(target) - toCents(realized), 0)),
    available,
    excess: tiers[last] > 0 ? fromCents(Math.max(toCents(realized) - toCents(tiers[last]), 0)) : 0,
  };
};

// Ritmo em relação à Meta (a faixa normal), de start a end (dias AAAA-MM-DD), olhando o dia de hoje
const paceOf = ({ realized, goal, start, end, today }) => {
  const totalDays = daysBetween(start, end) + 1;
  const elapsedDays = today < start ? 0 : today > end ? totalDays : daysBetween(start, today) + 1;
  const remainingDays = totalDays - elapsedDays;
  const expected = fromCents(Math.round((toCents(goal) * elapsedDays) / totalDays));
  const missing = Math.max(toCents(goal) - toCents(realized), 0);

  let status = "behind";
  if (goal > 0 && realized >= goal) status = "done";
  else if (elapsedDays === 0) status = "upcoming";
  else if (realized >= expected) status = "ahead";

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    expected,
    status,
    neededPerDay: remainingDays > 0 ? fromCents(Math.ceil(missing / remainingDays)) : fromCents(missing),
    projection: elapsedDays > 0 ? fromCents(Math.round((toCents(realized) / elapsedDays) * totalDays)) : 0,
  };
};

const roundMoney = (value) => Math.round(value) / 100;
const roundPercent = (ratio) => Math.round(ratio * 10000) / 100;
const sumOf = (values) => values.reduce((total, value) => total + value, 0);
const averageOf = (values) => (values.length ? sumOf(values) / values.length : 0);
const stdDevOf = (values) => {
  if (values.length < 2) return null;
  const mean = averageOf(values);
  return Math.sqrt(sumOf(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
};

// Chance (%) de chegar ao alvo no fim do mês: z = (alvo − realista) ÷ (desvio diário × raiz(dias que faltam))
const chanceOf = ({ realized, target, realistic, stdDev, daysLeft }) => {
  if (realized >= target) return 100;
  if (daysLeft === 0) return 0;
  if (stdDev === null) return null;
  if (stdDev === 0) return realistic >= target ? 100 : 0;
  return roundPercent(1 - normalCdf((target - realistic) / (stdDev * Math.sqrt(daysLeft))));
};

// Forecast do mês da meta no mesmo modelo do forecast da campanha (/analytics/forecast): dias produtivos
// (segunda a sábado, sem feriado), venda em domingo ou feriado no dia produtivo anterior, hoje conta como
// dia que passou, ritmo = média dos últimos 7 dias produtivos × 50% + dos últimos 30 × 30% + do mês × 20%
// (pesos do modelo do setor, config/forecastModels.js), cenários com os fatores do modelo e a chance de bater
// cada faixa pela normal. dailyCents: centavos de cada dia de `days` (dias do mês da meta)
const tierForecastsOf = ({ realized, pace, realistic, stdDev, daysLeft, tiers }) =>
  Object.fromEntries(
    TIERS.filter((tier) => tiers[tier] > 0).map((tier) => {
      const target = toCents(tiers[tier]);
      const requiredPace = daysLeft > 0 ? Math.max(target - realized, 0) / daysLeft : null;
      return [
        tier,
        {
          target: fromCents(target),
          requiredPace: requiredPace === null ? null : roundMoney(requiredPace),
          paceCoverage: requiredPace ? roundPercent(pace / requiredPace) : null,
          gap: roundMoney(target - realistic),
          probability: chanceOf({ realized, target, realistic, stdDev, daysLeft }),
        },
      ];
    }),
  );

const monthForecast = ({ days, dailyCents, tiers, today, model = forecastModelOf("b2b") }) => {
  const { paceWeights: PACE_WEIGHTS, scenarioFactors: SCENARIO_FACTORS } = model;
  const productive = days.filter(isProductiveDay);
  const elapsed = productive.filter((day) => day <= today);
  const remaining = productive.filter((day) => day > today);

  const perDay = new Map(elapsed.map((day) => [day, 0]));
  days.forEach((day, index) => {
    if (!elapsed.length || day > today) return;
    let target = elapsed[0];
    for (const productiveDay of elapsed) {
      if (productiveDay > day) break;
      target = productiveDay;
    }
    perDay.set(target, perDay.get(target) + dailyCents[index]);
  });
  const values = elapsed.map((day) => perDay.get(day));

  const realized = sumOf(dailyCents);
  const averages = { last7: averageOf(values.slice(-7)), last30: averageOf(values.slice(-30)), campaign: averageOf(values) };
  const pace = sumOf(Object.keys(PACE_WEIGHTS).map((key) => averages[key] * PACE_WEIGHTS[key]));
  const daysLeft = remaining.length;
  const scenarioCents = Object.fromEntries(
    Object.entries(SCENARIO_FACTORS).map(([name, factor]) => [name, realized + pace * factor * daysLeft]),
  );
  const stdDev = stdDevOf(values.slice(-30));

  const tierForecast = tierForecastsOf({ realized, pace, realistic: scenarioCents.realistic, stdDev, daysLeft, tiers });

  const trajectoryFor = (factor) => {
    let count = 0;
    return days.map((day) => {
      if (day < today) return null;
      if (day > today && isProductiveDay(day)) count += 1;
      return roundMoney(realized + pace * factor * count);
    });
  };

  return {
    model: { key: model.key, label: model.label, basedOn: model.basedOn },
    productiveDays: { elapsed: elapsed.length, remaining: daysLeft },
    pace: {
      current: roundMoney(pace),
      last7: roundMoney(averages.last7),
      last30: roundMoney(averages.last30),
      month: roundMoney(averages.campaign),
    },
    scenarios: Object.fromEntries(Object.entries(scenarioCents).map(([name, cents]) => [name, roundMoney(cents)])),
    dailyStdDev: stdDev === null ? null : roundMoney(stdDev),
    tiers: tierForecast,
    trajectory: Object.fromEntries(
      Object.entries(SCENARIO_FACTORS).map(([name, factor]) => [name, trajectoryFor(factor)]),
    ),
  };
};

// Forecast do total = soma dos forecasts dos setores (cada um com o seu modelo): ritmo, cenários e trajetória
// somados; o desvio vem das vendas somadas e a chance de cada faixa é recalculada com a soma
const combineMonthForecasts = ({ days, dailyCents, tiers, today, parts }) => {
  const base = monthForecast({ days, dailyCents, tiers, today });
  const pace = sumOf(parts.map((part) => toCents(part.pace.current)));
  const scenarioCents = Object.fromEntries(
    Object.keys(parts[0].scenarios).map((name) => [name, sumOf(parts.map((part) => toCents(part.scenarios[name])))]),
  );
  const sumSeries = (name) =>
    days.map((_, index) =>
      parts.every((part) => part.trajectory[name][index] === null)
        ? null
        : fromCents(sumOf(parts.map((part) => toCents(part.trajectory[name][index] ?? 0)))),
    );

  return {
    ...base,
    model: { key: "total", label: "Soma dos forecasts dos setores", basedOn: null, parts: parts.map((part) => part.model) },
    pace: { ...base.pace, current: fromCents(pace) },
    scenarios: Object.fromEntries(Object.entries(scenarioCents).map(([name, cents]) => [name, fromCents(cents)])),
    tiers: tierForecastsOf({
      realized: sumOf(dailyCents),
      pace,
      realistic: scenarioCents.realistic,
      stdDev: base.dailyStdDev === null ? null : toCents(base.dailyStdDev),
      daysLeft: base.productiveDays.remaining,
      tiers,
    }),
    trajectory: Object.fromEntries(Object.keys(base.trajectory).map((name) => [name, sumSeries(name)])),
  };
};

module.exports = {
  monthForecast,
  combineMonthForecasts,
  TIERS,
  dayKeyOf,
  addDays,
  startOfDay,
  toCents,
  fromCents,
  monthWeeks,
  monthDays,
  distributeByWeight,
  splitEqually,
  segmentParts,
  typeTiers,
  segmentTiers,
  peopleTiers,
  weekTiers,
  sumTiers,
  tierProgress,
  paceOf,
};
