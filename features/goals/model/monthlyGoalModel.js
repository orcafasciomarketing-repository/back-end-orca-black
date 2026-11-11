const { Schema, model } = require("mongoose");

const { VISIBILITY_KEYS } = require("../service/goalVisibility");

// Meta de um setor (b2b ou b2g) em um mês (AAAA-MM), com tudo o que o gestor cadastra: os níveis de Farmer e
// de Venda (Meta e Super em R$), o ticket médio e a conversão de cada tipo, a Meta black de Farmer e a de Venda
// (só no mês da campanha com Meta black) e a meta de cada vendedor.
// Cada mês é um documento, então mudar um mês não mexe no histórico dos outros.
// Meses salvos no modelo antigo têm níveis com peso, superPercent e metas por semana (weeks); continuam valendo
const levelSchema = new Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    // Modelo de níveis: o tipo do nível (cada tipo tem os seus) e a Meta e a Super em R$
    type: { type: String, enum: ["farm", "sales"] },
    goal: { type: Number, min: 0 },
    superGoal: { type: Number, min: 0 },
    // Só no mês com Meta black: a Black de quem é do nível (a de Farmer e a de Venda do setor são a soma das pessoas).
    // Mês salvo antes disso não tem
    blackGoal: { type: Number, min: 0, default: null },
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
    // Black de Venda: digitada no cadastro (blackTyped) ou, em mês salvo antes, a meta do setor na campanha −
    // Black de Farmer (só registro; o progresso recalcula com a meta atual da campanha)
    salesBlack: { type: Number, default: null },
    // true: a Black de Farmer e a de Venda foram digitadas no cadastro. Mês salvo antes (false): só a de Farmer
    // foi digitada e a de Venda é a meta do setor na campanha − Farmer
    blackTyped: { type: Boolean, default: false },
    levels: [levelSchema],
    people: [personSchema],
    // O que os vendedores do setor veem deste mês em "Minhas metas": open false fecha o mês inteiro (ex.: mês futuro
    // ainda não divulgado) e hidden lista os widgets e as faixas escondidos. Mês novo copia do último cadastrado.
    // Mês salvo antes (sem o campo): liberado e com tudo à mostra
    visibility: {
      open: { type: Boolean },
      hidden: [{ type: String, enum: VISIBILITY_KEYS }],
    },
    // E-mail de quem salvou por último
    updatedBy: { type: String },
  },
  { timestamps: true },
);

monthlyGoalSchema.index({ month: 1, segment: 1 }, { unique: true });

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(monthlyGoalSchema);

module.exports = model("MonthlyGoals", monthlyGoalSchema);
