const { Schema, model } = require("mongoose");

const TeamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// Gravar aqui limpa o cache dos resultados das contas (shared/resultCache.js)
require("../../../shared/resultCache").invalidateOnWrite(TeamSchema);

module.exports = model("Teams", TeamSchema);
