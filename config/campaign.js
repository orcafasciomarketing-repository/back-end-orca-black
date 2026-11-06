// Datas da campanha no horário de São Paulo (AAAA-MM-DD), usadas no forecast
const CAMPAIGN_START_DAY = "2026-11-03";
const CAMPAIGN_END_DAY = "2026-12-01";

// Feriados: não contam como dia produtivo (o domingo já não conta).
// Para acrescentar um feriado municipal, é só colocar a data aqui
const HOLIDAYS = ["2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25"];

// Ritmo ponderado: média dos últimos 7 dias produtivos, dos últimos 30 e da campanha toda
const PACE_WEIGHTS = { last7: 0.5, last30: 0.3, campaign: 0.2 };

// Cenários: quanto do ritmo atual cada um projeta para os dias que faltam
const SCENARIO_FACTORS = { pessimistic: 0.8, realistic: 1, optimistic: 1.2 };

module.exports = { CAMPAIGN_START_DAY, CAMPAIGN_END_DAY, HOLIDAYS, PACE_WEIGHTS, SCENARIO_FACTORS };
