const PrizeService = require("../service/prizeService");
const CampaignService = require("../../campaigns/service/campaignService");
const { getRoleSegment } = require("../../../config/roles");

// ?campaign=<id>: os prêmios são por campanha. Sem ele, a ativa
const campaignOf = (req) => CampaignService.resolve(req.query.campaign);

const toSegment = (value) => {
  const segment = String(value ?? "").toLowerCase();
  return ["b2b", "b2g"].includes(segment) ? segment : null;
};

// b2b e b2g sempre recebem só o próprio setor (o ?segment= é ignorado); master e admin podem filtrar
const segmentOf = (req) => getRoleSegment(req.user.role) ?? toSegment(req.query.segment);

exports.getSummary = async (req, res, next) => {
  const data = await PrizeService.getSummary(segmentOf(req), undefined, await campaignOf(req));
  return res.status(200).json({
    success: true,
    data,
    message: "Prêmios recuperados com sucesso",
  });
};

exports.getWithdrawals = async (req, res, next) => {
  const kind = ["vendor", "sdr"].includes(req.query.kind) ? req.query.kind : undefined;
  const personId = /^[0-9a-f]{24}$/i.test(String(req.query.personId ?? "")) ? req.query.personId : undefined;

  const data = await PrizeService.getWithdrawals(segmentOf(req), { kind, personId }, await campaignOf(req));
  return res.status(200).json({
    success: true,
    data,
    message: "Retiradas recuperadas com sucesso",
  });
};

exports.createWithdrawal = async (req, res, next) => {
  const data = await PrizeService.createWithdrawal(req.data, req.user.email, undefined, await campaignOf(req));
  return res.status(201).json({
    success: true,
    data,
    message: "Retirada registrada com sucesso",
  });
};

exports.deleteWithdrawal = async (req, res, next) => {
  await PrizeService.deleteWithdrawal(req.params.id);
  return res.status(200).json({
    success: true,
    message: "Retirada excluída com sucesso",
  });
};
