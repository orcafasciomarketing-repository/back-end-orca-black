const zod = require("zod");

// AAAA-MM-DD que existe no calendário (2026-02-30 não passa)
const isRealDay = (day) => new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
const day = (label) =>
  zod
    .string({ message: `${label} inválida` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} inválida`)
    .refine(isRealDay, `${label} inválida`);

const money = (label) =>
  zod.coerce
    .number({ message: `${label} inválida` })
    .finite(`${label} inválida`)
    .min(0, `${label} não pode ser negativa`);

const SaveCampaignSchema = zod
  .strictObject({
    name: zod.string({ message: "Informe o nome da campanha" }).trim().min(1, "Informe o nome da campanha").max(80, "Nome longo demais"),
    start: day("Data de início"),
    end: day("Data de fim"),
    goals: zod.strictObject({ b2b: money("Meta B2B"), b2g: money("Meta B2G") }),
    active: zod.boolean().optional(),
    hasBlackTier: zod.boolean().optional(),
  })
  .refine((data) => data.start <= data.end, { message: "A data de fim precisa ser igual ou depois do início" });

module.exports = { SaveCampaignSchema };
