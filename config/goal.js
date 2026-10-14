// Meta única da Black Friday (valor em reais). Padrão 0 se a variável não existir.
const BLACK_FRIDAY_GOAL = Number(process.env.BLACK_FRIDAY_GOAL ?? 0);

module.exports = { BLACK_FRIDAY_GOAL };
