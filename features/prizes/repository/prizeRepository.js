const PrizeWithdrawal = require("../model/prizeWithdrawalModel");

// campaign ({ id, isDefault }): só as retiradas da campanha (os prêmios são por campanha). As retiradas sem
// campanha (gravadas antes de existirem campanhas) são da primeira campanha (isDefault). Sem campaign, todas
const ofCampaign = (campaign) => {
  if (!campaign) return {};
  if (!campaign.isDefault) return { campaignId: campaign.id };
  return { $or: [{ campaignId: campaign.id }, { campaignId: { $exists: false } }, { campaignId: null }] };
};

exports.findAll = async (campaign) => {
  return await PrizeWithdrawal.find(ofCampaign(campaign)).sort({ withdrawnAt: -1, createdAt: -1 }).lean();
};

exports.findByPerson = async (kind, personId, campaign) => {
  return await PrizeWithdrawal.find({ kind, personId, ...ofCampaign(campaign) })
    .sort({ withdrawnAt: -1, createdAt: -1 })
    .lean();
};

exports.create = async (data) => {
  return await PrizeWithdrawal.create(data);
};

exports.deleteById = async (id) => {
  return await PrizeWithdrawal.findByIdAndDelete(id);
};

exports.countByCampaign = async (campaign) => {
  return await PrizeWithdrawal.countDocuments(ofCampaign(campaign));
};

// Retiradas gravadas antes de existirem campanhas passam a ser da primeira campanha
exports.assignCampaignToOrphans = async (campaignId) => {
  await PrizeWithdrawal.updateMany({ campaignId: { $exists: false } }, { $set: { campaignId } });
};
