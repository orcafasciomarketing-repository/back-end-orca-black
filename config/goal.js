// Metas da Black Friday (valores em reais). Padrão 0 se a variável não existir.
// Meta de cada setor: usada nos filtros B2B/B2G do admin
const BLACK_FRIDAY_GOAL_B2B = Number(process.env.BLACK_FRIDAY_GOAL_B2B ?? 0);
const BLACK_FRIDAY_GOAL_B2G = Number(process.env.BLACK_FRIDAY_GOAL_B2G ?? 0);

// Com as duas metas de setor configuradas, a meta total é a soma delas.
// Sem elas, continua valendo a BLACK_FRIDAY_GOAL (como era antes)
const hasSegmentGoals = BLACK_FRIDAY_GOAL_B2B > 0 && BLACK_FRIDAY_GOAL_B2G > 0;
const BLACK_FRIDAY_GOAL = hasSegmentGoals
  ? BLACK_FRIDAY_GOAL_B2B + BLACK_FRIDAY_GOAL_B2G
  : Number(process.env.BLACK_FRIDAY_GOAL ?? 0);

const SEGMENT_GOALS = { b2b: BLACK_FRIDAY_GOAL_B2B, b2g: BLACK_FRIDAY_GOAL_B2G };

module.exports = { BLACK_FRIDAY_GOAL, SEGMENT_GOALS };
