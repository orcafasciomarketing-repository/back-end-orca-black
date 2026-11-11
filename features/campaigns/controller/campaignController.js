const CampaignService = require("../service/campaignService");

exports.list = async (req, res, next) => {
  const data = await CampaignService.list();
  return res.status(200).json({ success: true, data, message: "Campanhas recuperadas com sucesso" });
};

exports.create = async (req, res, next) => {
  const data = await CampaignService.create(req.data, req.user.email);
  return res.status(201).json({ success: true, data, message: "Campanha cadastrada com sucesso" });
};

exports.update = async (req, res, next) => {
  const data = await CampaignService.update(req.params.id, req.data, req.user.email);
  return res.status(200).json({ success: true, data, message: "Campanha salva com sucesso" });
};

exports.remove = async (req, res, next) => {
  await CampaignService.remove(req.params.id);
  return res.status(200).json({ success: true, message: "Campanha excluída com sucesso" });
};
