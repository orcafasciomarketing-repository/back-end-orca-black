const { tierProgress } = require("./goalCalculator");

// O que o vendedor vê em "Minhas metas" (/me/goals), escolhido pelo admin em cada mês e setor.
// Widgets: cada bloco da tela. Faixas: a Super e a Black, que somem de todos os widgets quando escondidas
const VENDOR_WIDGETS = ["summary", "month", "forecast", "comparison", "breakdown", "week", "evolution", "weeks"];
const VENDOR_TIERS = ["super", "black"];
const VISIBILITY_KEYS = [...VENDOR_WIDGETS, ...VENDOR_TIERS];

// Mês salvo antes dessa configuração (sem o campo): liberado e com tudo à mostra, como era antes
const toVisibility = (visibility) => ({
  open: visibility?.open ?? true,
  hidden: VISIBILITY_KEYS.filter((key) => (visibility?.hidden ?? []).includes(key)),
});

const DEFAULT_VISIBILITY = toVisibility(null);

const isShown = (visibility, key) => !visibility.hidden.includes(key);

// Vendas e leads que faltam para a faixa atual: o que falta ÷ ticket e ÷ (ticket × conversão)
const neededOf = (remaining, ticket, conversion) => ({
  ...(ticket > 0 && { salesNeeded: Math.ceil(remaining / ticket) }),
  ...(ticket > 0 && conversion > 0 && { leadsNeeded: Math.ceil(remaining / ((ticket * conversion) / 100)) }),
});

const hiddenTiersOf = (visibility) => VENDOR_TIERS.filter((tier) => !isShown(visibility, tier));

const limitTiers = (tiers, hiddenTiers) =>
  tiers && hiddenTiers.length
    ? Object.fromEntries(Object.entries(tiers).map(([tier, value]) => [tier, hiddenTiers.includes(tier) ? 0 : value]))
    : tiers;

// Progresso refeito sem as faixas escondidas: a faixa atual, o que falta e o excedente passam a ser os das faixas
// que o vendedor vê (como num mês sem campanha, quando a Black não existe)
const limitProgress = (progress, hiddenTiers, { ticket, conversion, withNeeded }) => {
  const { salesNeeded, leadsNeeded, ...rest } = progress;
  const next = hiddenTiers.length ? { ...rest, ...tierProgress(rest.realized, limitTiers(rest.tiers, hiddenTiers)) } : rest;
  return withNeeded ? { ...next, ...neededOf(next.remaining, ticket, conversion) } : next;
};

const limitForecast = (forecast, hiddenTiers) =>
  forecast && {
    ...forecast,
    tiers: Object.fromEntries(Object.entries(forecast.tiers).filter(([tier]) => !hiddenTiers.includes(tier))),
  };

// A meta do vendedor só com o que ele pode ver. Não altera o objeto recebido (vem do cache das contas)
const personForVendor = (person, visibility) => {
  const hiddenTiers = hiddenTiersOf(visibility);
  const withBreakdown = isShown(visibility, "breakdown");
  const options = { ticket: person.ticket, conversion: person.conversion, withNeeded: withBreakdown };
  const withWeeks = isShown(visibility, "week") || isShown(visibility, "weeks");

  return {
    ...person,
    ticket: withBreakdown ? person.ticket : null,
    conversion: withBreakdown ? person.conversion : null,
    month: limitProgress(person.month, hiddenTiers, options),
    forecast: isShown(visibility, "forecast") ? limitForecast(person.forecast, hiddenTiers) : null,
    weeks: withWeeks ? person.weeks.map((week) => limitProgress(week, hiddenTiers, options)) : [],
  };
};

// Linha do histórico (outro mês): mês fechado para os vendedores fica sem faixas; as faixas escondidas naquele mês somem
const historyEntryForVendor = (entry, visibility) => ({
  ...entry,
  tiers: visibility.open ? limitTiers(entry.tiers, hiddenTiersOf(visibility)) : null,
});

const usesHistory = (visibility) => isShown(visibility, "comparison") || isShown(visibility, "evolution");

module.exports = {
  VENDOR_WIDGETS,
  VENDOR_TIERS,
  VISIBILITY_KEYS,
  DEFAULT_VISIBILITY,
  toVisibility,
  neededOf,
  personForVendor,
  historyEntryForVendor,
  usesHistory,
};
