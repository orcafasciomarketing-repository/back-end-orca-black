const { isValidObjectId } = require("mongoose");

const CampaignRepository = require("../repository/campaignRepository");
const SalesRepository = require("../../sale/repository/salesRepository");
const PrizeRepository = require("../../prizes/repository/prizeRepository");
const resultCache = require("../../../shared/resultCache");
const { broadcast } = require("../../../shared/sseManager");
const { CAMPAIGN_START_DAY, CAMPAIGN_END_DAY } = require("../../../config/campaign");
const { BLACK_FRIDAY_GOAL, SEGMENT_GOALS } = require("../../../config/goal");
const { ConflictError, DependencyError, NotFoundError, ValidationError } = require("../../../shared/errors");

const DAY_MS = 24 * 60 * 60 * 1000;

// Nome da primeira campanha, criada sozinha a partir do config/campaign.js e das metas do .env
const DEFAULT_NAME = "Campanha Black";

// Mudar uma campanha muda o que as TVs e as telas mostram: elas buscam os dados de novo, sem popup
const CAMPAIGN_CHANGED_EVENT = { type: "sale-updated" };

const addDays = (day, amount) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + amount * DAY_MS).toISOString().slice(0, 10);

// Começo do dia em São Paulo (00:00 = 03:00 UTC) e o último milissegundo do dia
const startOfDay = (day) => new Date(`${day}T03:00:00.000Z`);
const endOfDay = (day) => new Date(startOfDay(addDays(day, 1)).getTime() - 1);

// Período das vendas da campanha (datas do banco, em UTC)
const rangeOf = (campaign) => ({ from: startOfDay(campaign.start), to: endOfDay(campaign.end) });

const toCampaign = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  start: doc.start,
  end: doc.end,
  goals: { b2b: doc.goals?.b2b ?? 0, b2g: doc.goals?.b2g ?? 0 },
  goal: doc.goal ?? 0,
  active: Boolean(doc.active),
  hasBlackTier: Boolean(doc.hasBlackTier),
  isDefault: Boolean(doc.isDefault),
  updatedBy: doc.updatedBy ?? null,
  updatedAt: doc.updatedAt ?? null,
});

// Sem nenhuma campanha (primeiro uso depois da atualização): cria a campanha que era fixa no código, ativa e
// com Meta black. O período cobre todas as vendas que já estão no banco, para os totais das TVs continuarem
// iguais, e as retiradas de prêmio já registradas passam a ser dela
let creatingDefault = null;
const ensureCampaigns = async () => {
  if ((await CampaignRepository.count()) > 0) return;
  creatingDefault ??= (async () => {
    try {
      if ((await CampaignRepository.count()) > 0) return;
      const sold = await SalesRepository.findActiveDayRange();
      const created = await CampaignRepository.create({
        name: DEFAULT_NAME,
        start: sold && sold.first < CAMPAIGN_START_DAY ? sold.first : CAMPAIGN_START_DAY,
        end: sold && sold.last > CAMPAIGN_END_DAY ? sold.last : CAMPAIGN_END_DAY,
        goals: { b2b: SEGMENT_GOALS.b2b, b2g: SEGMENT_GOALS.b2g },
        goal: BLACK_FRIDAY_GOAL,
        active: true,
        hasBlackTier: true,
        isDefault: true,
      });
      await PrizeRepository.assignCampaignToOrphans(created._id);
    } finally {
      creatingDefault = null;
    }
  })();
  await creatingDefault;
};

const loadAll = async () => {
  await ensureCampaigns();
  return (await CampaignRepository.findAll()).map(toCampaign);
};

// A ativa. Sem nenhuma marcada (não deveria acontecer), a que começa por último
exports.getActive = async () => {
  await ensureCampaigns();
  const active = await CampaignRepository.findActive();
  if (active) return toCampaign(active);
  const [latest] = await CampaignRepository.findAll();
  return latest ? toCampaign(latest) : null;
};

// Lista do admin, a mais recente primeiro, com quantas vendas ativas e quanto cada campanha tem
exports.list = async () => {
  const campaigns = await loadAll();
  return await Promise.all(
    campaigns.map(async (campaign) => {
      const { from, to } = rangeOf(campaign);
      return { ...campaign, sales: await SalesRepository.summarizeActiveBetween(from, to) };
    }),
  );
};

// Todas as campanhas, sem os números de vendas (cadastro de metas, Meta black)
exports.findAll = loadAll;

exports.findById = async (id) => {
  if (!isValidObjectId(id)) throw ValidationError("Campanha inválida");
  const campaign = await CampaignRepository.findById(id);
  if (!campaign) throw NotFoundError("Campanha não encontrada");
  return toCampaign(campaign);
};

// ?campaign= das telas do admin. Sem ele, a ativa (TVs e área dos colaboradores)
exports.resolve = async (id) => {
  if (id === undefined || id === null || id === "") return await exports.getActive();
  return await exports.findById(String(id));
};

// Campanha com Meta black que começa no mês (AAAA-MM); null se nenhuma
exports.blackCampaignOf = (month, campaigns) =>
  campaigns
    .filter((campaign) => campaign.hasBlackTier && campaign.start.slice(0, 7) === month)
    .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;

const toDocument = (data, updatedBy) => ({
  name: data.name,
  start: data.start,
  end: data.end,
  goals: { b2b: data.goals.b2b, b2g: data.goals.b2g },
  goal: Math.round((data.goals.b2b + data.goals.b2g) * 100) / 100,
  hasBlackTier: Boolean(data.hasBlackTier),
  updatedBy,
});

exports.create = async (data, updatedBy) => {
  await ensureCampaigns();
  const created = await CampaignRepository.create({ ...toDocument(data, updatedBy), active: Boolean(data.active) });
  if (data.active) await CampaignRepository.deactivateOthers(created._id);
  broadcast(CAMPAIGN_CHANGED_EVENT);
  return toCampaign(created);
};

// Sempre fica uma campanha ativa: para trocar, marca-se a nova como ativa
exports.update = async (id, data, updatedBy) => {
  const current = await exports.findById(id);
  if (current.active && data.active === false) {
    throw ValidationError("Para desativar esta campanha, marque outra como ativa");
  }

  const updated = await CampaignRepository.update(id, {
    ...toDocument(data, updatedBy),
    active: data.active === undefined ? current.active : data.active,
  });
  if (updated.active) await CampaignRepository.deactivateOthers(updated._id);
  broadcast(CAMPAIGN_CHANGED_EVENT);
  return toCampaign(updated);
};

// A ativa e a que já tem retirada de prêmio não podem ser excluídas
exports.remove = async (id) => {
  const current = await exports.findById(id);
  if (current.active) throw ConflictError("A campanha ativa não pode ser excluída. Marque outra como ativa antes");
  if ((await PrizeRepository.countByCampaign(current)) > 0) {
    throw DependencyError("A campanha tem retiradas de prêmio registradas e não pode ser excluída");
  }
  await CampaignRepository.deleteById(id);
  broadcast(CAMPAIGN_CHANGED_EVENT);
};

exports.rangeOf = rangeOf;

// Guardadas por alguns segundos (shared/resultCache.js); gravar uma campanha limpa o cache na hora
exports.getActive = resultCache.memoize("campaigns.getActive", exports.getActive);
exports.list = resultCache.memoize("campaigns.list", exports.list);
exports.findAll = resultCache.memoize("campaigns.findAll", exports.findAll);
exports.findById = resultCache.memoize("campaigns.findById", exports.findById);
