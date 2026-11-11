const VendorsService = require("../../vendors/service/vendorsService");
const SdrService = require("../../sdr/service/sdrService");
const TeamsService = require("../../teams/service/teamsService");
const SalesService = require("../../sale/service/salesService");
const AnalyticsService = require("../../analytics/service/analyticsService");
const PrizeService = require("../../prizes/service/prizeService");
const MonthlyGoalService = require("../../goals/service/monthlyGoalService");
const MonthlyGoalRepository = require("../../goals/repository/monthlyGoalRepository");
const { segmentOfJob } = require("../../prizes/service/prizeService");
const {
  toVisibility,
  personForVendor,
  historyEntryForVendor,
  usesHistory,
} = require("../../goals/service/goalVisibility");
const { buildPrizeBalance } = require("../../prizes/service/prizeCalculator");
const { PRIZE_POINTS_STEP } = require("../../../config/prizes");
const { NotFoundError } = require("../../../shared/errors");

// Pessoa ligada à conta (vendedor ou passagem), já com o time.
// Pessoa apagada do cadastro: 404 (a conta continua, mas sem área)
const findPerson = async (user) => {
  const person =
    user.role === "vendor"
      ? await VendorsService.findById(user.vendorId)
      : await SdrService.findById(user.sdrId);
  if (!person) throw NotFoundError("Pessoa não encontrada");

  const team = person.teamId
    ? await TeamsService.findById(person.teamId)
    : null;

  return {
    kind: user.role,
    id: person._id,
    name: user.role === "vendor" ? person.vendorName : person.name,
    job: person.job,
    imageUrl: person.imageUrl,
    team: team
      ? { teamId: team._id, teamName: team.name, teamShirt: team.imageUrl }
      : null,
  };
};

exports.getProfile = findPerson;

// Vendedor: as vendas dele. Passagem: as vendas em que ele participou da passagem
exports.getSales = async (user) => {
  await findPerson(user);
  return user.role === "vendor"
    ? await SalesService.findByVendor(user.vendorId)
    : await SalesService.findBySdr(user.sdrId);
};

// Time da pessoa: posição entre os times e os pontos de cada colega (só pontos, nada de vendas)
exports.getTeam = async (user, period) => {
  const person = await findPerson(user);
  const [scoreboard, peoplePoints] = await Promise.all([
    AnalyticsService.getScoreboard(period),
    AnalyticsService.getPeoplePoints({ period }),
  ]);

  const teamId = person.team ? String(person.team.teamId) : null;
  const teams = scoreboard.map((team, index) => ({
    position: index + 1,
    teamId: team.teamId,
    teamName: team.teamName,
    teamShirt: team.teamShirt,
    total: team.total,
  }));

  return {
    period,
    team: teams.find((team) => String(team.teamId) === teamId) ?? null,
    teams,
    people: peoplePoints.people
      .filter((member) => teamId && String(member.teamId) === teamId)
      .map((member, index) => ({
        position: index + 1,
        personId: member.personId,
        kind: member.kind,
        name: member.name,
        job: member.job,
        imageUrl: member.imageUrl,
        sales: member.sales,
        farm: member.farm,
        passage: member.passage,
        total: member.total,
        isMe:
          member.kind === person.kind &&
          String(member.personId) === String(person.id),
      })),
  };
};

// Prêmios da própria pessoa: o mesmo cálculo da tela de prêmios do admin (RN-66 e RN-67)
exports.getPrizes = async (user) => {
  const person = await findPerson(user);
  const summary = await PrizeService.getSummary(null);
  const mine = summary.people.find(
    (item) => item.kind === person.kind && String(item.personId) === String(person.id),
  );
  const balance = mine ?? buildPrizeBalance({ accumulated: 0, step: PRIZE_POINTS_STEP });

  return {
    step: summary.step,
    accumulated: balance.accumulated,
    currentWeek: balance.currentWeek,
    earned: balance.earned,
    withdrawn: balance.withdrawn,
    balance: balance.balance,
    pointsToNext: balance.pointsToNext,
  };
};

// Metas do mês do próprio vendedor (a mesma conta da tela "Painel de metas" do admin, só com a parte dele):
// as faixas, o realizado, o ritmo, a previsão, cada semana e o histórico dos meses.
// Só o que o admin liberou para o setor naquele mês (visibility): mês fechado → person null e closed true; widgets
// escondidos vêm sem os dados deles e as faixas escondidas somem de todos (o histórico usa o que vale em cada mês).
// Sem meta cadastrada para ele no mês (ou pessoa de passagem), person vem null
exports.getGoals = async (user, month) => {
  const person = await findPerson(user);
  const [progress, history] = await Promise.all([
    MonthlyGoalService.getProgress(month),
    MonthlyGoalService.getHistory(month),
  ]);
  const myId = String(person.id);
  const mine = (people) => people.filter((item) => person.kind === "vendor" && String(item.vendorId) === myId);

  const found = mine(progress.people)[0] ?? null;
  const segment = found?.segment ?? segmentOfJob(person.job);
  const settings = await MonthlyGoalRepository.findVisibilityByMonths(history.months.map((item) => item.month).concat(month));
  const visibilityOf = (key, itemSegment) =>
    toVisibility(settings.find((config) => config.month === key && config.segment === itemSegment)?.visibility);
  const visibility = visibilityOf(month, segment);
  const closed = Boolean(found) && !visibility.open;
  const shown = found && !closed ? personForVendor(found, visibility) : null;

  return {
    month: progress.month,
    today: progress.today,
    weeks: progress.weeks,
    days: progress.days,
    black: progress.black,
    visibility,
    closed,
    person: shown,
    history: {
      month: history.month,
      months:
        shown && usesHistory(visibility)
          ? history.months.map((item) => ({
              month: item.month,
              start: item.start,
              end: item.end,
              people: mine(item.people).map((entry) => historyEntryForVendor(entry, visibilityOf(item.month, entry.segment))),
            }))
          : [],
    },
  };
};
