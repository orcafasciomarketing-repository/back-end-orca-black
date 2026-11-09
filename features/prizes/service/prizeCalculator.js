// Cálculo dos prêmios. Funções puras: recebem os pontos já calculados e as retiradas,
// então dá para testar as regras com números exatos.
//
// Regras:
// - pontos acumulados = todos os pontos até agora, inclusive os da semana em andamento
//   (os prêmios são entregues na segunda e contam o que a pessoa já fez);
// - direitos = acumulados ÷ passo (arredondado para baixo): a sobra passa para as semanas seguintes;
// - saldo = direitos − retirados. Fica negativo quando uma venda é cancelada depois da retirada:
//   o prêmio retirado continua contando, então a venda nova só "paga a dívida"

// O Brasil não tem mais horário de verão: São Paulo é sempre UTC-3
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

// Dia (AAAA-MM-DD) de uma data no horário de São Paulo
const dayKeyOf = (date) => new Date(new Date(date).getTime() - SAO_PAULO_OFFSET_MS).toISOString().slice(0, 10);

const addDays = (day, amount) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

// Semana em andamento (segunda a domingo): só para mostrar quanto a pessoa fez nesta semana
const prizeWeekOf = (now = new Date()) => {
  const today = dayKeyOf(now);
  const weekDay = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = addDays(today, -((weekDay || 7) - 1));
  return { today, start, end: addDays(start, 6) };
};

const personKeyOf = (kind, personId) => `${kind}-${String(personId)}`;

// Saldo de uma pessoa. accumulated já inclui a semana em andamento; currentWeek é só informação
const buildPrizeBalance = ({ accumulated, currentWeek = 0, withdrawn = 0, step }) => {
  const earned = Math.floor(accumulated / step);
  // Próximo prêmio: depois dos direitos já ganhos ou, se está devendo, depois dos já retirados
  const nextPrizeAt = step * (Math.max(earned, withdrawn) + 1);

  return {
    accumulated,
    currentWeek,
    earned,
    withdrawn,
    balance: earned - withdrawn,
    debtPoints: Math.max(withdrawn * step - accumulated, 0),
    nextPrizeAt,
    pointsToNext: nextPrizeAt - accumulated,
  };
};

// allPeople / currentPeople: as listas de pessoas do getPeoplePoints (todos os pontos e só os da
// semana em andamento); withdrawals: as retiradas ({ personId, kind, quantity })
const buildPrizeSummary = ({ allPeople, currentPeople, withdrawals, step }) => {
  const currentByKey = new Map(currentPeople.map((person) => [personKeyOf(person.kind, person.personId), person.total]));

  const withdrawnByKey = new Map();
  for (const withdrawal of withdrawals) {
    const key = personKeyOf(withdrawal.kind, withdrawal.personId);
    withdrawnByKey.set(key, (withdrawnByKey.get(key) ?? 0) + withdrawal.quantity);
  }

  return allPeople
    .map((person) => {
      const key = personKeyOf(person.kind, person.personId);
      return {
        personId: person.personId,
        kind: person.kind,
        name: person.name,
        job: person.job,
        imageUrl: person.imageUrl,
        teamId: person.teamId,
        ...buildPrizeBalance({
          accumulated: person.total,
          currentWeek: currentByKey.get(key) ?? 0,
          withdrawn: withdrawnByKey.get(key) ?? 0,
          step,
        }),
      };
    })
    .sort(
      (a, b) =>
        b.balance - a.balance ||
        b.accumulated - a.accumulated ||
        String(a.name).localeCompare(String(b.name), "pt-BR"),
    );
};

module.exports = { prizeWeekOf, personKeyOf, buildPrizeBalance, buildPrizeSummary };
