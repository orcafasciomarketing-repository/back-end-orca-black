const { Schema, model } = require("mongoose");

// Meta de um setor (b2b ou b2g) em um mês (AAAA-MM), com tudo o que o gestor cadastra: os níveis de Farmer e
// de Venda (Meta e Super em R$, % de antecipação, up-sell e churn), o ticket médio de cada tipo, quanto da Meta
// black do setor é de renovação (só no mês da campanha com Meta black) e a meta de cada vendedor.
// Cada mês é um documento, então mudar um mês não mexe no histórico dos outros.
// Meses salvos no modelo antigo têm níveis com peso, superPercent e metas por semana (weeks); continuam valendo
const levelSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    // Modelo de níveis: o tipo do nível (cada tipo tem os seus), a Meta e a Super em R$ e a divisão da meta
    type: { type: String, enum: ["farm", "sales"] },
    goal: { type: Number, min: 0 },
    superGoal: { type: Number, min: 0 },
    anticipation: { type: Number, min: 0, max: 100 },
    upsell: { type: Number, min: 0, max: 100 },
    churn: { type: Number, min: 0, max: 100 },
    // Modelo antigo: peso de senioridade
    weight: { type: Number, min: 0 },
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
    // Super meta e Meta black da pessoa, como o gestor deixou (a Black só no mês da campanha)
    superGoal: { type: Number, default: null },
    blackGoal: { type: Number, default: null },
    // Modelo antigo: uma meta por semana do mês (hoje a meta da semana é recalculada a cada semana)
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
    // Super de cada parte (soma das Supers das pessoas). No modelo antigo ficam null e vale superPercent
    farmSuper: { type: Number, default: null },
    salesSuper: { type: Number, default: null },
    superPercent: { type: Number, default: null },
    // Ticket médio de cada tipo, para "quantas vendas faltam"
    tickets: {
      farm: { type: Number, default: null },
      sales: { type: Number, default: null },
    },
    // Taxa de conversão (%) de leads em vendas de cada tipo, para "quantos leads faltam" (planilha de vendas: 30%)
    conversion: {
      farm: { type: Number, default: null },
      sales: { type: Number, default: null },
    },
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

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(monthlyGoalSchema);

module.exports = model("MonthlyGoals", monthlyGoalSchema);
