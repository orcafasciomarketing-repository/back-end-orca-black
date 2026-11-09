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
    // E-mail de quem registrou
    createdBy: {
      type: String,
    },
  },
  { timestamps: true },
);

prizeWithdrawalSchema.index({ kind: 1, personId: 1 });

module.exports = model("PrizeWithdrawals", prizeWithdrawalSchema);
