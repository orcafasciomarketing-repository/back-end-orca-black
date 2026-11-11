const { Schema, model } = require("mongoose");

// Campanha: período (AAAA-MM-DD, horário de São Paulo) e metas de cada setor em reais.
// As vendas entram na campanha pela data da venda (do início ao fim, os dois dias inclusos).
// A campanha ativa é a das TVs e da área dos colaboradores; o admin escolhe qualquer uma.
// hasBlackTier: o mês em que a campanha começa ganha a faixa Meta black no cadastro de metas,
// com as metas de setor desta campanha
const campaignSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    goals: {
      b2b: { type: Number, required: true, min: 0, default: 0 },
      b2g: { type: Number, required: true, min: 0, default: 0 },
    },
    // Meta total. Nas campanhas cadastradas pela tela é a soma dos setores; a primeira (criada a partir do
    // .env) guarda a BLACK_FRIDAY_GOAL, como era antes
    goal: { type: Number, required: true, min: 0, default: 0 },
    active: { type: Boolean, default: false },
    hasBlackTier: { type: Boolean, default: false },
    // A primeira campanha, criada sozinha a partir do código e do .env: as retiradas de prêmio sem campanha
    // (gravadas antes de existirem campanhas) são dela
    isDefault: { type: Boolean, default: false },
    // E-mail de quem salvou por último
    updatedBy: { type: String },
  },
  { timestamps: true },
);

campaignSchema.index({ active: 1 });

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(campaignSchema);

module.exports = model("Campaigns", campaignSchema);
