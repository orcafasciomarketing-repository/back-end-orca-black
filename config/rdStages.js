const STAGE_MAP = {
  [process.env.B2B_FUNIL_BLACKFRIDAY_SALES]: {
    segment: "b2b",
    funnelType: "sales",
  },
  [process.env.B2B_FUNIL_BLACKFRIDAY_FARM]: {
    segment: "b2b",
    funnelType: "farm",
  },
  [process.env.B2G_FUNIL_BLACKFRIDAY_SALES]: {
    segment: "b2g",
    funnelType: "sales",
  },
  [process.env.B2G_FUNIL_BLACKFRIDAY_FARM]: {
    segment: "b2g",
    funnelType: "farm",
  },
};

module.exports = { STAGE_MAP };
