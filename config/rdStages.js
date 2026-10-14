const STAGE_ENTRIES = [
  [
    "B2B_FUNIL_BLACKFRIDAY_SALES",
    { segment: "b2b", funnelType: "sales" },
  ],
  [
    "B2B_FUNIL_BLACKFRIDAY_FARM",
    { segment: "b2b", funnelType: "farm" },
  ],
  [
    "B2G_FUNIL_BLACKFRIDAY_SALES",
    { segment: "b2g", funnelType: "sales" },
  ],
  [
    "B2G_FUNIL_BLACKFRIDAY_FARM",
    { segment: "b2g", funnelType: "farm" },
  ],
];

// Etapa sem id no .env fica fora do mapa: senão a chave vira "undefined" ou ""
// e um deal sem etapa (deal_stage.id vazio) seria tratado como Blackfriday
const missingStages = STAGE_ENTRIES.filter(([envName]) => !process.env[envName]);
if (missingStages.length > 0) {
  console.warn(
    `Etapas Blackfriday sem id configurado: ${missingStages.map(([envName]) => envName).join(", ")}`,
  );
}

const STAGE_MAP = Object.fromEntries(
  STAGE_ENTRIES.filter(([envName]) => process.env[envName]).map(
    ([envName, classification]) => [process.env[envName], classification],
  ),
);

module.exports = { STAGE_MAP };
