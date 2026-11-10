const MonthlyGoalRepository = require("../repository/monthlyGoalRepository");
const SalesRepository = require("../../sale/repository/salesRepository");
const VendorsService = require("../../vendors/service/vendorsService");
const TeamsService = require("../../teams/service/teamsService");
const { segmentOfJob } = require("../../prizes/service/prizeService");
const { ValidationError } = require("../../../shared/errors");
const { BLACK_FRIDAY_GOAL, SEGMENT_GOALS } = require("../../../config/goal");
const { CAMPAIGN_START_DAY } = require("../../../config/campaign");
const {
  dayKeyOf,
  addDays,
  startOfDay,
  toCents,
  fromCents,
  monthWeeks,
  monthDays,
  segmentParts,
  typeTiers,
  segmentTiers,
  peopleTiers,
  weekTiers,
  sumTiers,
  tierProgress,
  paceOf,
} = require("./goalCalculator");

const SEGMENTS = ["b2b", "b2g"];

// A Meta black só vale no mês em que a campanha começa. A de cada setor é a do .env
// (BLACK_FRIDAY_GOAL_B2B/B2G, a mesma das TVs): o gestor só diz quanto dela é de Farmer, e Venda fica com o resto
const BLACK_MONTH = CAMPAIGN_START_DAY.slice(0, 7);

const sectorBlackOf = (segment) => (SEGMENT_GOALS[segment] > 0 ? SEGMENT_GOALS[segment] : 0);

const blackInfo = (month) => ({
  month: BLACK_MONTH,
  active: month === BLACK_MONTH,
  total: BLACK_FRIDAY_GOAL,
  sectorGoals: Object.fromEntries(SEGMENTS.map((segment) => [segment, sectorBlackOf(segment)])),
});

// Black de Venda = Black do setor (.env) − Black de Farmer, sempre com o valor atual do .env
const withSectorBlack = (config) => {
  const sector = sectorBlackOf(config.segment);
  const farm = Math.min(toCents(config.farmBlack ?? 0), toCents(sector));
  return { ...config, farmBlack: fromCents(farm), salesBlack: fromCents(toCents(sector) - farm) };
};
const TYPE_LABELS = { farm: "Renovação", sales: "Vendas" };
const TIER_LABELS = { super: "Super meta", black: "Meta black" };

// Farmer conta só renovações; os outros cargos (Venda, Sales, Executivo...) contam vendas novas
const typeOfJob = (job) => (/farm/i.test(String(job ?? "")) ? "farm" : "sales");

const money = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const toVendor = (vendor, teamsById) => {
  const team = teamsById.get(String(vendor.teamId));
  return {
    vendorId: String(vendor._id),
    name: vendor.vendorName,
    job: vendor.job,
    imageUrl: vendor.imageUrl,
    teamId: vendor.teamId ? String(vendor.teamId) : null,
    teamName: team?.name ?? null,
    type: typeOfJob(vendor.job),
  };
};

const toConfig = (config) => ({
  month: config.month,
  farmGoal: config.farmGoal,
  salesGoal: config.salesGoal,
  superPercent: config.superPercent,
  farmBlack: config.farmBlack ?? null,
  salesBlack: config.salesBlack ?? null,
  levels: config.levels.map(({ key, name, weight }) => ({ key, name, weight })),
  people: config.people.map((person) => ({
    vendorId: String(person.vendorId),
    type: person.type,
    level: person.level,
    goal: person.goal,
    superGoal: person.superGoal ?? null,
    blackGoal: person.blackGoal ?? null,
    weeks: [...person.weeks],
  })),
  updatedBy: config.updatedBy ?? null,
  updatedAt: config.updatedAt ?? null,
});

const loadPeopleContext = async () => {
  const [vendors, teams] = await Promise.all([VendorsService.findAll(), TeamsService.findAll()]);
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));
  return { vendors, teamsById };
};

// Tela de cadastro: as semanas do mês, a meta salva de cada setor (ou, sem meta, a do último mês
// cadastrado, para copiar) e os vendedores de cada setor pelo cargo ("B2B ..." / "B2G ...")
exports.getMonth = async (month) => {
  const weeks = monthWeeks(month);
  const [configs, { vendors, teamsById }] = await Promise.all([
    MonthlyGoalRepository.findByMonth(month),
    loadPeopleContext(),
  ]);

  const segments = {};
  for (const segment of SEGMENTS) {
    const config = configs.find((item) => item.segment === segment);
    const previous = config ? null : await MonthlyGoalRepository.findLatestBefore(month, segment);
    segments[segment] = {
      config: config ? toConfig(config) : null,
      previous: previous ? toConfig(previous) : null,
      vendors: vendors
        .filter((vendor) => segmentOfJob(vendor.job) === segment)
        .map((vendor) => toVendor(vendor, teamsById))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "pt-BR")),
    };
  }

  return { month, weeks, black: blackInfo(month), segments };
};

// Só salva quando tudo fecha: cada vendedor do setor uma vez, nível existente, soma das semanas = mensal
// e a soma das metas de cada tipo = a parte do setor (renovação e vendas)
exports.saveMonth = async (month, segment, data, updatedBy) => {
  const weeks = monthWeeks(month);
  const { vendors } = await loadPeopleContext();
  const vendorsById = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  const levelKeys = data.levels.map((level) => level.key);
  if (new Set(levelKeys).size !== levelKeys.length) throw ValidationError("Há níveis repetidos");

  const seen = new Set();
  const totals = { farm: 0, sales: 0 };
  const people = data.people.map((person) => {
    const vendor = vendorsById.get(person.vendorId);
    if (!vendor) throw ValidationError("Vendedor não encontrado");
    if (seen.has(person.vendorId)) throw ValidationError(`${vendor.vendorName} aparece mais de uma vez`);
    seen.add(person.vendorId);
    if (segmentOfJob(vendor.job) !== segment) {
      throw ValidationError(`${vendor.vendorName} não é do setor ${segment.toUpperCase()}`);
    }
    if (!levelKeys.includes(person.level)) throw ValidationError(`Escolha um nível válido para ${vendor.vendorName}`);
    if (person.weeks.length !== weeks.length) {
      throw ValidationError(`${vendor.vendorName} precisa de uma meta para cada uma das ${weeks.length} semanas`);
    }
    const weeksCents = person.weeks.reduce((sum, value) => sum + toCents(value), 0);
    if (weeksCents !== toCents(person.goal)) {
      throw ValidationError(
        `Semanas de ${vendor.vendorName}: a soma dá ${money(fromCents(weeksCents))}, mas a meta mensal é ${money(person.goal)}`,
      );
    }

    const type = typeOfJob(vendor.job);
    totals[type] += toCents(person.goal);
    return {
      vendorId: person.vendorId,
      name: vendor.vendorName,
      type,
      level: person.level,
      goal: fromCents(toCents(person.goal)),
      superGoal: person.superGoal ?? null,
      blackGoal: person.blackGoal ?? null,
      weeks: person.weeks.map((value) => fromCents(toCents(value))),
    };
  });

  const isBlackMonth = blackInfo(month).active;
  const sectorBlack = sectorBlackOf(segment);
  if (isBlackMonth) {
    if (sectorBlack <= 0) {
      throw ValidationError(`A Meta black do ${segment.toUpperCase()} não está configurada no backend (BLACK_FRIDAY_GOAL_${segment.toUpperCase()})`);
    }
    if (toCents(data.farmBlack ?? 0) > toCents(sectorBlack)) {
      throw ValidationError(`A Meta black Farmer passa da Meta black do setor (${money(sectorBlack)})`);
    }
    const byType = typeTiers(withSectorBlack({ ...data, segment }), true);
    for (const type of ["farm", "sales"]) {
      const tiers = byType[type];
      if (tiers.goal > 0 && !(tiers.black > tiers.super)) {
        throw ValidationError(
          `${TYPE_LABELS[type]}: a Meta black precisa ser maior que a Super meta (${money(tiers.super)})`,
        );
      }
    }
  }

  const parts = segmentParts(data);
  for (const type of ["farm", "sales"]) {
    if (totals[type] !== toCents(parts[type])) {
      throw ValidationError(
        `${TYPE_LABELS[type]}: distribuído ${money(fromCents(totals[type]))} de ${money(parts[type])}`,
      );
    }
  }

  // Super e Black de cada pessoa: a que o gestor mandou ou, sem valor, a parte proporcional à Meta.
  // A soma de cada parte precisa dar a Super/Black da parte, e a pessoa não pode ter Super menor que a Meta
  // nem Black menor que a Super
  const byType = typeTiers(isBlackMonth ? withSectorBlack({ ...data, segment }) : data, isBlackMonth);
  const tiers = ["super", ...(isBlackMonth ? ["black"] : [])];
  const fallback = peopleTiers(
    people.map((person) => ({ ...person, superGoal: null, blackGoal: null })),
    byType,
  );
  const tiersOf = new Map(
    people.map((person) => {
      const base = fallback.get(person.vendorId);
      return [
        person.vendorId,
        {
          super: fromCents(toCents(person.superGoal ?? base.super)),
          black: isBlackMonth ? fromCents(toCents(person.blackGoal ?? base.black)) : null,
        },
      ];
    }),
  );
  for (const person of people) {
    const own = tiersOf.get(person.vendorId);
    if (toCents(own.super) < toCents(person.goal)) {
      throw ValidationError(`A Super meta de ${person.name} não pode ser menor que a Meta do mês (${money(person.goal)})`);
    }
    if (isBlackMonth && toCents(own.black) < toCents(own.super)) {
      throw ValidationError(`A Meta black de ${person.name} não pode ser menor que a Super meta (${money(own.super)})`);
    }
  }
  for (const tier of tiers) {
    for (const type of ["farm", "sales"]) {
      const sum = people
        .filter((person) => person.type === type)
        .reduce((total, person) => total + toCents(tiersOf.get(person.vendorId)[tier]), 0);
      if (sum !== toCents(byType[type][tier])) {
        throw ValidationError(
          `${TIER_LABELS[tier]} ${TYPE_LABELS[type]}: distribuído ${money(fromCents(sum))} de ${money(byType[type][tier])}`,
        );
      }
    }
  }

  const saved = await MonthlyGoalRepository.upsert(month, segment, {
    farmGoal: fromCents(toCents(data.farmGoal)),
    salesGoal: fromCents(toCents(data.salesGoal)),
    superPercent: data.superPercent,
    farmBlack: isBlackMonth ? withSectorBlack({ ...data, segment }).farmBlack : null,
    salesBlack: isBlackMonth ? withSectorBlack({ ...data, segment }).salesBlack : null,
    levels: data.levels.map(({ key, name, weight }) => ({ key: key.trim(), name: name.trim(), weight })),
    people: people.map(({ name, ...person }) => ({
      ...person,
      superGoal: tiersOf.get(person.vendorId).super,
      blackGoal: tiersOf.get(person.vendorId).black,
    })),
    updatedBy,
  });
  return toConfig(saved);
};

exports.deleteMonth = async (month, segment) => {
  return await MonthlyGoalRepository.deleteOne(month, segment);
};

const cumulative = (values) => {
  let sum = 0;
  return values.map((value) => {
    sum += value;
    return fromCents(sum);
  });
};

// Análise do mês: progresso de cada vendedor, de cada setor e de cada time (soma das pessoas),
// no mês e em cada semana, com as três faixas e o ritmo
exports.getProgress = async (month, now = new Date()) => {
  const today = dayKeyOf(now);
  const weeks = monthWeeks(month);
  const days = monthDays(weeks);
  const configs = (await MonthlyGoalRepository.findByMonth(month)).sort((a, b) => a.segment.localeCompare(b.segment));

  const empty = { month, today, weeks, days, black: blackInfo(month), segments: [], people: [], teams: [] };
  if (!configs.length || !weeks.length) {
    return { ...empty, summary: { people: 0, reachedGoal: 0, reachedSuper: 0, reachedBlack: 0, onPace: 0, behind: 0 } };
  }

  const first = weeks[0].start;
  const last = weeks[weeks.length - 1].end;
  const [sales, { vendors, teamsById }] = await Promise.all([
    SalesRepository.findActiveByRealizedAt(startOfDay(first), new Date(startOfDay(addDays(last, 1)).getTime() - 1)),
    loadPeopleContext(),
  ]);
  const vendorsById = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));
  const dayIndex = new Map(days.map((day, index) => [day, index]));

  // Centavos por dia de cada vendedor em cada tipo de venda
  const dailyByKey = new Map();
  for (const sale of sales) {
    if (!sale.vendorId) continue;
    const index = dayIndex.get(dayKeyOf(sale.realizedAt));
    if (index === undefined) continue;
    const key = `${String(sale.vendorId)}-${sale.funnelType}`;
    if (!dailyByKey.has(key)) dailyByKey.set(key, new Array(days.length).fill(0));
    dailyByKey.get(key)[index] += toCents(sale.value);
  }

  const sumRange = (daily, start, end) =>
    days.reduce((sum, day, index) => (day >= start && day <= end ? sum + daily[index] : sum), 0);

  const progressOf = (realized, tiers, start, end) => ({
    ...tierProgress(realized, tiers),
    pace: paceOf({ realized, goal: tiers.goal, start, end, today }),
  });

  const black = blackInfo(month);
  const people = [];
  const segments = [];
  for (const config of configs) {
    const levelNames = new Map(config.levels.map((level) => [level.key, level.name]));
    const byType = typeTiers(black.active ? withSectorBlack(config) : config, black.active);
    const tiers = segmentTiers(byType);
    const tiersByPerson = peopleTiers(config.people, byType);
    const segmentPeople = config.people.map((person) => {
      const vendorId = String(person.vendorId);
      const vendor = vendorsById.get(vendorId);
      const daily = dailyByKey.get(`${vendorId}-${person.type}`) ?? new Array(days.length).fill(0);
      const realized = fromCents(daily.reduce((sum, value) => sum + value, 0));
      const personTiers = tiersByPerson.get(vendorId);
      const personWeekTiers = weekTiers(personTiers, weeks.map((_, index) => person.weeks[index] ?? 0));
      const team = vendor?.teamId ? teamsById.get(String(vendor.teamId)) : null;

      return {
        vendorId,
        segment: config.segment,
        type: person.type,
        name: vendor?.vendorName ?? "Pessoa removida",
        job: vendor?.job ?? null,
        imageUrl: vendor?.imageUrl ?? null,
        teamId: vendor?.teamId ? String(vendor.teamId) : null,
        teamName: team?.name ?? null,
        level: person.level,
        levelName: levelNames.get(person.level) ?? person.level,
        month: progressOf(realized, personTiers, first, last),
        weeks: weeks.map((week, index) => ({
          index,
          start: week.start,
          end: week.end,
          ...progressOf(fromCents(sumRange(daily, week.start, week.end)), personWeekTiers[index], week.start, week.end),
        })),
        daily,
      };
    });

    const parts = segmentParts(config);
    const realizedOf = (list) => fromCents(list.reduce((sum, person) => sum + toCents(person.month.realized), 0));
    const segmentDaily = days.map((_, index) => segmentPeople.reduce((sum, person) => sum + person.daily[index], 0));

    segments.push({
      segment: config.segment,
      goal: tiers.goal,
      superPercent: config.superPercent,
      parts: Object.fromEntries(
        ["farm", "sales"].map((type) => [
          type,
          {
            goal: parts[type],
            ...progressOf(realizedOf(segmentPeople.filter((person) => person.type === type)), byType[type], first, last),
          },
        ]),
      ),
      month: progressOf(realizedOf(segmentPeople), tiers, first, last),
      weeks: weeks.map((week, index) => {
        const weekTiers = sumTiers(segmentPeople.map((person) => person.weeks[index].tiers));
        const realized = fromCents(sumRange(segmentDaily, week.start, week.end));
        return { index, start: week.start, end: week.end, ...progressOf(realized, weekTiers, week.start, week.end) };
      }),
      cumulative: cumulative(segmentDaily),
    });
    people.push(...segmentPeople);
  }

  const teamsMap = new Map();
  for (const person of people) {
    const key = person.teamId ?? "sem-time";
    if (!teamsMap.has(key)) teamsMap.set(key, { teamId: person.teamId, teamName: person.teamName ?? "Sem time", members: [] });
    teamsMap.get(key).members.push(person);
  }
  const teams = [...teamsMap.values()]
    .map((team) => {
      const tiers = sumTiers(team.members.map((person) => person.month.tiers));
      const realized = fromCents(team.members.reduce((sum, person) => sum + toCents(person.month.realized), 0));
      const teamDaily = days.map((_, index) => team.members.reduce((sum, person) => sum + person.daily[index], 0));
      return {
        teamId: team.teamId,
        teamName: team.teamName,
        imageUrl: team.teamId ? teamsById.get(team.teamId)?.imageUrl ?? null : null,
        members: team.members.length,
        month: progressOf(realized, tiers, first, last),
        cumulative: cumulative(teamDaily),
      };
    })
    .sort((a, b) => b.month.realized / (b.month.tiers.goal || 1) - a.month.realized / (a.month.tiers.goal || 1));

  const goalShare = (person) => (person.month.tiers.goal > 0 ? person.month.realized / person.month.tiers.goal : 0);
  const sortedPeople = people
    .map(({ daily, ...person }) => ({ ...person, cumulative: cumulative(daily) }))
    .sort((a, b) => goalShare(b) - goalShare(a) || String(a.name).localeCompare(String(b.name), "pt-BR"));

  const reached = (tier) => people.filter((person) => person.month.reached.includes(tier)).length;
  return {
    ...empty,
    segments,
    people: sortedPeople,
    teams,
    summary: {
      people: people.length,
      reachedGoal: reached("goal"),
      reachedSuper: reached("super"),
      reachedBlack: reached("black"),
      onPace: people.filter((person) => ["ahead", "done"].includes(person.month.pace.status)).length,
      behind: people.filter((person) => person.month.pace.status === "behind").length,
    },
  };
};

exports.typeOfJob = typeOfJob;
