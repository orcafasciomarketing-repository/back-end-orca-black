const { Schema, model } = require("mongoose");

const activeSalesCache = require("../../../shared/activeSalesCache");
const resultCache = require("../../../shared/resultCache");

const saleSchema = new Schema(
  {
    rdDealName: {
      type: String,
    },
    rdDealId: {
      type: String,
      required: true,
      unique: true,
    },
    // Obrigatório na planilha (o adapter exige). Só a importação grava venda sem
    // vendedor: ela conta na meta, mas não dá pontos a nenhum time
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendors",
    },
    value: {
      type: Number,
      required: true,
    },
    // Pessoas que fizeram passagem nesta venda (pode ser mais de uma). Lista vazia = sem passagem
    sdrIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "SDR",
      },
    ],
    rdUpdatedAt: {
      type: Date,
      required: true,
    },
    segment: {
      type: String,
      required: true,
      enum: ["b2b", "b2g"],
    },
    funnelType: {
      type: String,
      required: true,
      enum: ["farm", "sales"],
    },
    realizedAt: {
      type: Date,
      required: true,
    },
    dealStatus: {
      type: String,
      enum: ["ativa", "cancelada"],
      required: true,
    },
    // De onde a venda veio. A importação só substitui as vendas "importacao";
    // vendas antigas, sem o campo, são da planilha
    source: {
      type: String,
      enum: ["planilha", "importacao"],
      default: "planilha",
    },
    // Lote da importação: as vendas novas entram antes de as antigas saírem
    importId: {
      type: String,
    },
  },
  { timestamps: true },
);

// Buscas das telas: vendas ativas por data, e as de cada vendedor
saleSchema.index({ dealStatus: 1, realizedAt: 1 });
saleSchema.index({ vendorId: 1 });

// Qualquer gravação em vendas limpa o cache das vendas ativas (shared/activeSalesCache.js) e o dos
// resultados das contas (shared/resultCache.js)
resultCache.invalidateOnWrite(saleSchema, activeSalesCache.clear);

module.exports = model("Sales", saleSchema);
