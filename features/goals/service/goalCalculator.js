// Cálculo das metas mensais. Funções puras (sem banco), para testar as regras com números exatos.
//
// Regras:
// - a semana vai de segunda a domingo e pertence ao mês da segunda-feira;
// - o mês da meta são as semanas que começam nele (soma das semanas = mês);
// - valores em reais, comparados em centavos para a soma sempre fechar;
// - três faixas, todas em R$ por setor: Meta, Super meta e Meta black (a black só no mês da campanha).
//   Cada uma desce igual: setor → renovação/vendas (farmPercent) → pessoas, na proporção da Meta de cada
//   pessoa (que já vem dos pesos de senioridade) → semanas, na proporção da Meta de cada semana.

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

// Renovação = valor × farmPercent%; vendas = o resto (a soma sempre fecha)
const splitByFarm = (value, farmPercent) => {
  const totalCents = toCents(value);
  const farmCents = Math.round((totalCents * farmPercent) / 100);
  return { farm: fromCents(farmCents), sales: fromCents(totalCents - farmCents) };
};

const segmentParts = ({ goal, farmPercent }) => splitByFarm(goal, farmPercent);

const segmentTiers = ({ goal, superGoal }, blackGoal = 0) => ({
  goal: fromCents(toCents(goal)),
  super: fromCents(toCents(superGoal)),
  black: fromCents(toCents(blackGoal)),
});

// Reparte centavos na proporção de outros valores (em centavos); sem proporção, divide igual
const shareLike = (totalCents, keys, weightsCents) => {
  const hasWeight = weightsCents.some((value) => value > 0);
  return distributeByWeight(
    totalCents,
    keys.map((key, index) => ({ key, weight: hasWeight ? weightsCents[index] : 1 })),
  );
};

// Faixas de cada pessoa: a Meta é a dela; a Super e a Black do setor descem para renovação/vendas e
// depois para as pessoas daquele tipo, na proporção da Meta de cada uma
const peopleTiers = (people, tiers, farmPercent) => {
  const result = new Map(people.map((person) => [String(person.vendorId), { goal: fromCents(toCents(person.goal)), super: 0, black: 0 }]));
  for (const tier of ["super", "black"]) {
    const parts = splitByFarm(tiers[tier], farmPercent);
    for (const type of ["farm", "sales"]) {
      const members = people.filter((person) => person.type === type);
      const shares = shareLike(
        toCents(parts[type]),
        members.map((person) => String(person.vendorId)),
        members.map((person) => toCents(person.goal)),
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
  splitByFarm,
  segmentParts,
  segmentTiers,
  peopleTiers,
  weekTiers,
  sumTiers,
  tierProgress,
  paceOf,
};
