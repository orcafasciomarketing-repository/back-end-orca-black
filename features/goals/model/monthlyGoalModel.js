const { Schema, model } = require("mongoose");

// Meta de um setor (b2b ou b2g) em um mês (AAAA-MM), com tudo o que o gestor cadastra:
// a Meta de renovação e a de vendas em R$, o % da Super meta sobre a Meta, quanto da Meta black do
// setor (.env) é de renovação (só no mês da campanha), os níveis de senioridade e a meta de cada vendedor (mensal e por
// semana). Cada mês é um documento, então mudar um mês não mexe no histórico dos outros
const levelSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    weight: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const personSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendors", required: true },
    // Renovação (Farmer) ou vendas novas, pelo cargo no momento do cadastro
    type: { type: String, required: true, enum: ["farm", "sales"] },
    level: { type: String, required: true },
    goal: { type: Number, required: true, min: 0 },
    // Uma meta por semana do mês, na ordem das semanas
    weeks: [{ type: Number, min: 0 }],
  },
  { _id: false },
);

const monthlyGoalSchema = new Schema(
  {
    month: { type: String, required: true },
    segment: { type: String, required: true, enum: ["b2b", "b2g"] },
    farmGoal: { type: Number, required: true, min: 0 },
    salesGoal: { type: Number, required: true, min: 0 },
    superPercent: { type: Number, required: true },
    // Só no mês da campanha; nos outros, null
    farmBlack: { type: Number, default: null },
    // Black do setor (.env) − Black de Farmer, gravada para registro; o progresso recalcula com o .env atual
    salesBlack: { type: Number, default: null },
    levels: [levelSchema],
    people: [personSchema],
    // E-mail de quem salvou por último
    updatedBy: { type: String },
  },
  { timestamps: true },
);

monthlyGoalSchema.index({ month: 1, segment: 1 }, { unique: true });

module.exports = model("MonthlyGoals", monthlyGoalSchema);
