const { Schema, model } = require("mongoose");

// Cada documento é uma retirada de prêmio. O saldo não é gravado: é calculado
// (direitos pelos pontos − soma das retiradas), então excluir um lançamento errado
// já corrige o saldo
const prizeWithdrawalSchema = new Schema(
  {
    // Vendedor (Vendors) ou pessoa de passagem (SDR, CS e Suporte ficam na coleção SDR)
    personId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    kind: {
      type: String,
      required: true,
      enum: ["vendor", "sdr"],
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // Dia da retirada (AAAA-MM-DD, horário de São Paulo)
    withdrawnAt: {
      type: String,
      required: true,
    },
    // Campanha da retirada (os prêmios são por campanha). As antigas, sem o campo, recebem a primeira campanha
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaigns",
    },
    // E-mail de quem registrou
    createdBy: {
      type: String,
    },
  },
  { timestamps: true },
);

prizeWithdrawalSchema.index({ kind: 1, personId: 1 });
prizeWithdrawalSchema.index({ campaignId: 1 });

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(prizeWithdrawalSchema);

module.exports = model("PrizeWithdrawals", prizeWithdrawalSchema);
