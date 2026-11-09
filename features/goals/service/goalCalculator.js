// Cálculo das metas mensais. Funções puras (sem banco), para testar as regras com números exatos.
//
// Regras:
// - a semana vai de segunda a domingo e pertence ao mês da segunda-feira;
// - o mês da meta são as semanas que começam nele (soma das semanas = mês);
// - valores em reais, comparados em centavos para a soma sempre fechar;
// - três faixas: Meta, Super meta (Meta × superPercent%) e Meta black (Meta × blackPercent%).

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

// Parte do setor: renovação = meta × farmPercent%; vendas = o resto (a soma sempre fecha)
const segmentParts = ({ goal, farmPercent }) => {
  const totalCents = toCents(goal);
  const farmCents = Math.round((totalCents * farmPercent) / 100);
  return { farm: fromCents(farmCents), sales: fromCents(totalCents - farmCents) };
};

const tiersOf = (goal, superPercent, blackPercent) => {
  const cents = toCents(goal);
  return {
    goal: fromCents(cents),
    super: fromCents(Math.round((cents * superPercent) / 100)),
    black: fromCents(Math.round((cents * blackPercent) / 100)),
  };
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

// Faixa atual: a primeira ainda não batida. Bateu as três: fica na black, e o que passar é excedente
const tierProgress = (realized, tiers) => {
  const reached = TIERS.filter((tier) => tiers[tier] > 0 && realized >= tiers[tier]);
  const current = TIERS.find((tier) => !reached.includes(tier)) ?? "black";
  const target = tiers[current];

  return {
    realized: fromCents(toCents(realized)),
    tiers,
    reached,
    current,
    target,
    percent: target > 0 ? round1((realized / target) * 100) : 0,
    remaining: fromCents(Math.max(toCents(target) - toCents(realized), 0)),
    excess: fromCents(Math.max(toCents(realized) - toCents(tiers.black), 0)),
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

module.exports = {
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
  tiersOf,
  sumTiers,
  tierProgress,
  paceOf,
};
