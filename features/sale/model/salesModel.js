const { Schema, model } = require("mongoose");

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
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendors",
      required: true,
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
  },
  { timestamps: true },
);

module.exports = model("Sales", saleSchema);
