// Prêmios: a cada PRIZE_POINTS_STEP pontos acumulados a pessoa ganha direito a 1 prêmio.
// Valor inválido (vazio, 0, negativo, texto) volta para 10
const parsedStep = Number(process.env.PRIZE_POINTS_STEP);
const PRIZE_POINTS_STEP = Number.isInteger(parsedStep) && parsedStep > 0 ? parsedStep : 10;

module.exports = { PRIZE_POINTS_STEP };
