const { Schema, model } = require("mongoose");

const sdrSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    imageUrl: {
      type: String,
      /*required: true,*/
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Teams",
      required: true,
    },
    job: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(sdrSchema);

module.exports = model("SDR", sdrSchema);
