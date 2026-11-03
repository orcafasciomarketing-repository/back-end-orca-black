// Pontos da venda: Setor da venda (b2b/b2g) + Classificação (sales = Venda, farm = Farmer/Renovação)
const salePointsMap = new Map([
  ["b2g-sales", Number(process.env.POINTS_B2G_SALE ?? 0)],
  ["b2g-farm", Number(process.env.POINTS_B2G_FARM ?? 0)],
  ["b2b-sales", Number(process.env.POINTS_B2B_SALE ?? 0)],
  ["b2b-farm", Number(process.env.POINTS_B2B_FARM ?? 0)],
]);

// Pontos da passagem: dependem do cargo (job) da pessoa, cadastrado no seed
const passagePointsMap = new Map([
  ["b2g sdr", Number(process.env.POINTS_B2G_SDR ?? 0)],
  ["b2b sdr", Number(process.env.POINTS_B2B_SDR ?? 0)],
  ["cs", Number(process.env.POINTS_CS ?? 0)],
  ["suporte", Number(process.env.POINTS_SUPORTE ?? 0)],
]);

// "B2B  SDR", "b2b sdr" e "Suporte " viram a mesma chave do map
const normalizeJob = (job) =>
  String(job ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Combinação que não está na tabela vale 0
const getSalePoints = (sale) =>
  salePointsMap.get(`${sale.segment}-${sale.funnelType}`) ?? 0;

const getPassagePoints = (sdr) =>
  passagePointsMap.get(normalizeJob(sdr?.job)) ?? 0;

module.exports = { getSalePoints, getPassagePoints };
