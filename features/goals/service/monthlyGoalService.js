const MonthlyGoalRepository = require("../repository/monthlyGoalRepository");
const SalesRepository = require("../../sale/repository/salesRepository");
const VendorsService = require("../../vendors/service/vendorsService");
const TeamsService = require("../../teams/service/teamsService");
const { segmentOfJob } = require("../../prizes/service/prizeService");
const { ValidationError } = require("../../../shared/errors");
const CampaignService = require("../../campaigns/service/campaignService");
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
  dynamicWeekTiers,
  sumTiers,
  tierProgress,
  paceOf,
  monthForecast,
  combineMonthForecasts,
} = require("./goalCalculator");
const { forecastModelOf } = require("../../../config/forecastModels");

const SEGMENTS = ["b2b", "b2g"];

// A Meta black só vale no mês em que começa uma campanha marcada com Meta black (cadastro de campanhas).
// A de cada setor é a meta do setor nessa campanha (a mesma das TVs): o gestor só diz quanto dela é de Farmer,
// e Venda fica com o resto
const blackInfo = (month, campaigns) => {
  const campaign = CampaignService.blackCampaignOf(month, campaigns);
  return {
    month: campaign ? month : null,
    active: Boolean(campaign),
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    total: campaign ? campaign.goal : 0,
    sectorGoals: Object.fromEntries(
      SEGMENTS.map((segment) => [segment, campaign && campaign.goals[segment] > 0 ? campaign.goals[segment] : 0]),
    ),
  };
};

// Meta black de cada parte: a digitada no cadastro (Farmer e Venda). Mês salvo antes disso (só a de Farmer
// digitada): Venda = meta do setor na campanha − Farmer
const withSectorBlack = (config, black) => {
  if (config.farmBlack != null && config.salesBlack != null && config.blackTyped) return config;
  const sector = black.sectorGoals[config.segment] ?? 0;
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

// model: "levels" (Meta e Super em R$ por nível, planilha do comercial) ou "weights" (modelo antigo, com pesos e
// superPercent): o cadastro do front converte o antigo ao abrir
const toConfig = (config) => ({
  month: config.month,
  model: config.levels.some((level) => level.type) ? "levels" : "weights",
  farmGoal: config.farmGoal,
  salesGoal: config.salesGoal,
  farmSuper: config.farmSuper ?? null,
  salesSuper: config.salesSuper ?? null,
  superPercent: config.superPercent ?? null,
  farmBlack: config.farmBlack ?? null,
  salesBlack: config.salesBlack ?? null,
  blackTyped: Boolean(config.blackTyped),
  tickets: { farm: config.tickets?.farm ?? null, sales: config.tickets?.sales ?? null },
  conversion: { farm: config.conversion?.farm ?? null, sales: config.conversion?.sales ?? null },
  levels: config.levels.map((level) => ({
    key: level.key,
    name: level.name,
    type: level.type ?? null,
    goal: level.goal ?? null,
    superGoal: level.superGoal ?? null,
    weight: level.weight ?? null,
  })),
  people: config.people.map((person) => ({
    vendorId: String(person.vendorId),
    type: person.type,
    level: person.level,
    goal: person.goal,
    superGoal: person.superGoal ?? null,
    blackGoal: person.blackGoal ?? null,
    weeks: [...(person.weeks ?? [])],
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

  const campaigns = await CampaignService.findAll();
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

  return { month, weeks, black: blackInfo(month, campaigns), segments };
};

// Só salva quando tudo fecha: níveis sem repetição (por tipo) e com Super ≥ Meta, cada vendedor do setor uma vez
// com um nível do tipo dele e Super ≥ Meta; a parte de cada tipo é a soma das pessoas. No mês com Meta black,
// a Black de cada parte vem da campanha (Farmer digitado, Venda o resto) e cada pessoa tem Black ≥ Super
exports.saveMonth = async (month, segment, data, updatedBy) => {
  const { vendors } = await loadPeopleContext();
  const vendorsById = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  const levelId = (type, key) => `${type}:${key.trim()}`;
  const levelIds = data.levels.map((level) => levelId(level.type, level.key));
  if (new Set(levelIds).size !== levelIds.length) throw ValidationError("Há níveis repetidos");
  for (const level of data.levels) {
    const label = `${TYPE_LABELS[level.type]} · ${level.name.trim()}`;
    if (toCents(level.superGoal) < toCents(level.goal)) {
      throw ValidationError(`${label}: a Super meta não pode ser menor que a Meta (${money(level.goal)})`);
    }
  }

  const seen = new Set();
  const totals = { farm: { goal: 0, super: 0 }, sales: { goal: 0, super: 0 } };
  const people = data.people.map((person) => {
    const vendor = vendorsById.get(person.vendorId);
    if (!vendor) throw ValidationError("Vendedor não encontrado");
    if (seen.has(person.vendorId)) throw ValidationError(`${vendor.vendorName} aparece mais de uma vez`);
    seen.add(person.vendorId);
    if (segmentOfJob(vendor.job) !== segment) {
      throw ValidationError(`${vendor.vendorName} não é do setor ${segment.toUpperCase()}`);
    }
    const type = typeOfJob(vendor.job);
    if (!levelIds.includes(levelId(type, person.level))) {
      throw ValidationError(`Escolha um nível de ${TYPE_LABELS[type]} válido para ${vendor.vendorName}`);
    }
    if (toCents(person.superGoal) < toCents(person.goal)) {
      throw ValidationError(`A Super meta de ${vendor.vendorName} não pode ser menor que a Meta do mês (${money(person.goal)})`);
    }
    totals[type].goal += toCents(person.goal);
    totals[type].super += toCents(person.superGoal);
    return {
      vendorId: person.vendorId,
      name: vendor.vendorName,
      type,
      level: person.level.trim(),
      goal: fromCents(toCents(person.goal)),
      superGoal: fromCents(toCents(person.superGoal)),
      blackGoal: person.blackGoal ?? null,
    };
  });
  if (totals.farm.goal + totals.sales.goal <= 0) throw ValidationError("A meta do setor precisa ser maior que zero");

  const config = {
    segment,
    farmGoal: fromCents(totals.farm.goal),
    salesGoal: fromCents(totals.sales.goal),
    farmSuper: fromCents(totals.farm.super),
    salesSuper: fromCents(totals.sales.super),
    superPercent: null,
    farmBlack: data.farmBlack ?? null,
    salesBlack: data.salesBlack ?? null,
  };

  const black = blackInfo(month, await CampaignService.findAll());
  const isBlackMonth = black.active;
  const byType = typeTiers(config, isBlackMonth);
  const blackOf = new Map(people.map((person) => [person.vendorId, null]));

  // Mês com Meta black: o gestor digita a Black de Farmer e a de Venda (cada uma ≥ a Super da parte; pode ser igual)
  if (isBlackMonth) {
    for (const type of ["farm", "sales"]) {
      const tiers = byType[type];
      if (tiers.goal > 0 && config[`${type}Black`] == null) {
        throw ValidationError(`Informe a Meta black de ${TYPE_LABELS[type]}`);
      }
      if (tiers.goal > 0 && toCents(tiers.black) < toCents(tiers.super)) {
        throw ValidationError(
          `${TYPE_LABELS[type]}: a Meta black não pode ser menor que a Super meta (${money(tiers.super)})`,
        );
      }
    }

    // Black de cada pessoa: a que veio ou, sem valor, a parte proporcional à Super dela
    const fallback = peopleTiers(
      people.map((person) => ({ ...person, blackGoal: null })),
      byType,
    );
    for (const person of people) {
      const own = fromCents(toCents(person.blackGoal ?? fallback.get(person.vendorId).black));
      if (toCents(own) < toCents(person.superGoal)) {
        throw ValidationError(`A Meta black de ${person.name} não pode ser menor que a Super meta (${money(person.superGoal)})`);
      }
      blackOf.set(person.vendorId, own);
    }
    for (const type of ["farm", "sales"]) {
      const sum = people
        .filter((person) => person.type === type)
        .reduce((total, person) => total + toCents(blackOf.get(person.vendorId)), 0);
      if (sum !== toCents(byType[type].black)) {
        throw ValidationError(
          `${TIER_LABELS.black} ${TYPE_LABELS[type]}: distribuído ${money(fromCents(sum))} de ${money(byType[type].black)}`,
        );
      }
    }
  }

  const saved = await MonthlyGoalRepository.upsert(month, segment, {
    farmGoal: config.farmGoal,
    salesGoal: config.salesGoal,
    farmSuper: config.farmSuper,
    salesSuper: config.salesSuper,
    superPercent: null,
    farmBlack: isBlackMonth ? fromCents(toCents(config.farmBlack ?? 0)) : null,
    salesBlack: isBlackMonth ? fromCents(toCents(config.salesBlack ?? 0)) : null,
    blackTyped: isBlackMonth,
    tickets: { farm: data.tickets?.farm ?? null, sales: data.tickets?.sales ?? null },
    conversion: { farm: data.conversion?.farm ?? null, sales: data.conversion?.sales ?? null },
    levels: data.levels.map((level) => ({
      key: level.key.trim(),
      name: level.name.trim(),
      type: level.type,
      goal: fromCents(toCents(level.goal)),
      superGoal: fromCents(toCents(level.superGoal)),
    })),
    people: people.map(({ name, ...person }) => ({ ...person, blackGoal: blackOf.get(person.vendorId), weeks: [] })),
    updatedBy,
  });
  return toConfig(saved);
};

exports.deleteMonth = async (month, segment) => {
  return await MonthlyGoalRepository.deleteOne(month, segment);
};

const sumOf = (values) => values.reduce((total, value) => total + value, 0);

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
  const [found, campaigns] = await Promise.all([MonthlyGoalRepository.findByMonth(month), CampaignService.findAll()]);
  const configs = [...found].sort((a, b) => a.segment.localeCompare(b.segment));

  const empty = { month, today, weeks, days, black: blackInfo(month, campaigns), total: null, segments: [], people: [], teams: [] };
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

  // ticket: o ticket médio do tipo da pessoa; com ele vem quantas vendas faltam para a faixa atual e, com a
  // taxa de conversão (%), quantos leads: o que falta ÷ (ticket × conversão), como na planilha de vendas
  const progressOf = (realized, tiers, start, end, ticket = null, conversion = null) => {
    const progress = tierProgress(realized, tiers);
    return {
      ...progress,
      pace: paceOf({ realized, goal: tiers.goal, start, end, today }),
      ...(ticket > 0 && { salesNeeded: Math.ceil(progress.remaining / ticket) }),
      ...(ticket > 0 && conversion > 0 && { leadsNeeded: Math.ceil(progress.remaining / ((ticket * conversion) / 100)) }),
    };
  };
  const forecastOf = (dailyCents, tiers, segment) =>
    monthForecast({ days, dailyCents, tiers, today, model: forecastModelOf(segment) });
  const sumDaily = (list) => days.map((_, index) => list.reduce((sum, daily) => sum + daily[index], 0));
  const allByType = { farm: [], sales: [] };

  const black = blackInfo(month, campaigns);
  const people = [];
  const segments = [];
  for (const config of configs) {
    const levelOf = (type, key) =>
      config.levels.find((level) => level.key === key && (!level.type || level.type === type)) ?? null;
    const byType = typeTiers(black.active ? withSectorBlack(config, black) : config, black.active);
    const tiers = segmentTiers(byType);
    const tiersByPerson = peopleTiers(config.people, byType);
    const segmentPeople = config.people.map((person) => {
      const vendorId = String(person.vendorId);
      const vendor = vendorsById.get(vendorId);
      const daily = dailyByKey.get(`${vendorId}-${person.type}`) ?? new Array(days.length).fill(0);
      const realized = fromCents(daily.reduce((sum, value) => sum + value, 0));
      const personTiers = tiersByPerson.get(vendorId);
      const personWeekTiers = dynamicWeekTiers({ personTiers, daily, days, weeks, today });
      const team = vendor?.teamId ? teamsById.get(String(vendor.teamId)) : null;
      const level = levelOf(person.type, person.level);
      const ticket = config.tickets?.[person.type] ?? null;
      const conversion = config.conversion?.[person.type] ?? null;

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
        levelName: level?.name ?? person.level,
        ticket,
        conversion,
        month: progressOf(realized, personTiers, first, last, ticket, conversion),
        forecast: forecastOf(daily, personTiers, config.segment),
        weeks: weeks.map((week, index) => ({
          index,
          start: week.start,
          end: week.end,
          ...progressOf(fromCents(sumRange(daily, week.start, week.end)), personWeekTiers[index], week.start, week.end, ticket, conversion),
        })),
        daily,
      };
    });

    const parts = segmentParts(config);
    const realizedOf = (list) => fromCents(list.reduce((sum, person) => sum + toCents(person.month.realized), 0));
    const segmentDaily = sumDaily(segmentPeople.map((person) => person.daily));
    for (const type of ["farm", "sales"]) {
      allByType[type].push(byType[type]);
    }

    segments.push({
      segment: config.segment,
      goal: tiers.goal,
      superPercent: config.superPercent ?? null,
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
      forecast: forecastOf(segmentDaily, tiers, config.segment),
      weeks: weeks.map((week, index) => {
        const weekTiers = sumTiers(segmentPeople.map((person) => person.weeks[index].tiers));
        const realized = fromCents(sumRange(segmentDaily, week.start, week.end));
        return { index, start: week.start, end: week.end, ...progressOf(realized, weekTiers, week.start, week.end) };
      }),
      cumulative: cumulative(segmentDaily),
    });
    people.push(...segmentPeople);
  }

  // Total: os setores somados (com "Todos" no filtro do admin)
  const totalDaily = sumDaily(people.map((person) => person.daily));
  const totalTiers = sumTiers(segments.map((item) => item.month.tiers));
  const totalRealized = (list) => fromCents(sumOf(list.map((person) => toCents(person.month.realized))));
  const total = {
    goal: totalTiers.goal,
    parts: Object.fromEntries(
      ["farm", "sales"].map((type) => {
        const typeTotal = sumTiers(allByType[type]);
        return [
          type,
          {
            goal: typeTotal.goal,
            ...progressOf(totalRealized(people.filter((person) => person.type === type)), typeTotal, first, last),
          },
        ];
      }),
    ),
    month: progressOf(totalRealized(people), totalTiers, first, last),
    forecast: combineMonthForecasts({
      days,
      dailyCents: totalDaily,
      tiers: totalTiers,
      today,
      parts: segments.map((item) => item.forecast),
    }),
    weeks: weeks.map((week, index) => {
      const weekTotal = sumTiers(segments.map((item) => item.weeks[index].tiers));
      const realized = fromCents(sumRange(totalDaily, week.start, week.end));
      return { index, start: week.start, end: week.end, ...progressOf(realized, weekTotal, week.start, week.end) };
    }),
    cumulative: cumulative(totalDaily),
  };

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
    total,
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

// Faixas do mês (Meta, Super e, no mês da campanha, Black) do setor ou dos setores somados; null sem meta
exports.getMonthTiers = async (month, segment = null) => {
  const configs = (await MonthlyGoalRepository.findByMonth(month)).filter((config) => !segment || config.segment === segment);
  if (!configs.length) return null;
  const black = blackInfo(month, await CampaignService.findAll());
  return sumTiers(
    configs.map((config) => segmentTiers(typeTiers(black.active ? withSectorBlack(config, black) : config, black.active))),
  );
};

const shiftMonth = (month, amount) => {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
};

// Histórico mês a mês (o mês escolhido e os anteriores): o realizado do total, de cada setor e de cada
// vendedor, com as faixas do mês quando ele tem meta cadastrada. Cada mês são as semanas que começam nele.
// Mês com meta: conta as pessoas cadastradas, cada uma no tipo dela. Mês sem meta: os vendedores de cada
// setor pelo cargo de hoje, cada um no tipo do cargo, e as faixas vêm null
exports.getHistory = async (month, count = 6) => {
  const months = Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1));
  const ranges = months.map((key) => ({ month: key, weeks: monthWeeks(key) })).filter((item) => item.weeks.length);
  const first = ranges[0].weeks[0].start;
  const lastWeeks = ranges[ranges.length - 1].weeks;
  const last = lastWeeks[lastWeeks.length - 1].end;

  const [sales, { vendors }, configsByMonth, campaigns] = await Promise.all([
    SalesRepository.findActiveByRealizedAt(startOfDay(first), new Date(startOfDay(addDays(last, 1)).getTime() - 1)),
    loadPeopleContext(),
    Promise.all(ranges.map((item) => MonthlyGoalRepository.findByMonth(item.month))),
    CampaignService.findAll(),
  ]);

  const monthOfDay = (day) =>
    ranges.findIndex((item) => day >= item.weeks[0].start && day <= item.weeks[item.weeks.length - 1].end);
  const cents = ranges.map(() => new Map());
  for (const sale of sales) {
    if (!sale.vendorId) continue;
    const index = monthOfDay(dayKeyOf(sale.realizedAt));
    if (index < 0) continue;
    const key = `${String(sale.vendorId)}-${sale.funnelType}`;
    cents[index].set(key, (cents[index].get(key) ?? 0) + toCents(sale.value));
  }

  const segmentVendors = vendors.filter((vendor) => SEGMENTS.includes(segmentOfJob(vendor.job)));

  return {
    month,
    black: blackInfo(month, campaigns),
    months: ranges.map((item, index) => {
      const configs = configsByMonth[index];
      const itemBlack = blackInfo(item.month, campaigns);
      const isBlack = itemBlack.active;
      const realizedOf = (vendorId, type) => cents[index].get(`${vendorId}-${type}`) ?? 0;
      const people = [];
      const segments = {};

      for (const segment of SEGMENTS) {
        const config = configs.find((entry) => entry.segment === segment);
        if (config) {
          const byType = typeTiers(isBlack ? withSectorBlack(config, itemBlack) : config, isBlack);
          const tiersByPerson = peopleTiers(config.people, byType);
          const segmentPeople = config.people.map((person) => ({
            vendorId: String(person.vendorId),
            segment,
            type: person.type,
            realized: fromCents(realizedOf(String(person.vendorId), person.type)),
            tiers: tiersByPerson.get(String(person.vendorId)),
          }));
          people.push(...segmentPeople);
          segments[segment] = {
            realized: fromCents(sumOf(segmentPeople.map((person) => toCents(person.realized)))),
            tiers: segmentTiers(byType),
          };
        } else {
          const segmentPeople = segmentVendors
            .filter((vendor) => segmentOfJob(vendor.job) === segment)
            .map((vendor) => {
              const type = typeOfJob(vendor.job);
              return {
                vendorId: String(vendor._id),
                segment,
                type,
                realized: fromCents(realizedOf(String(vendor._id), type)),
                tiers: null,
              };
            });
          people.push(...segmentPeople);
          segments[segment] = {
            realized: fromCents(sumOf(segmentPeople.map((person) => toCents(person.realized)))),
            tiers: null,
          };
        }
      }

      const withTiers = SEGMENTS.filter((segment) => segments[segment].tiers);
      return {
        month: item.month,
        start: item.weeks[0].start,
        end: item.weeks[item.weeks.length - 1].end,
        total: {
          realized: fromCents(sumOf(SEGMENTS.map((segment) => toCents(segments[segment].realized)))),
          tiers: withTiers.length ? sumTiers(withTiers.map((segment) => segments[segment].tiers)) : null,
        },
        segments,
        people,
      };
    }),
  };
};

// Progresso e histórico guardados por alguns segundos (shared/resultCache.js): a área de cada vendedor usa a
// mesma conta do mês, então muitos vendedores abrindo juntos fazem a conta uma vez só. Gravar metas, vendas,
// vendedores, times ou campanhas limpa o cache na hora
const resultCache = require("../../../shared/resultCache");
exports.getProgress = resultCache.memoize("goals.getProgress", exports.getProgress);
exports.getHistory = resultCache.memoize("goals.getHistory", exports.getHistory);
