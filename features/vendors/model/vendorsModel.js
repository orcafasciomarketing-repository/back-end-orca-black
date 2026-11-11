const { Schema, model } = require("mongoose");

const VendorSchema = new Schema(
  {
    rdUserId: {
      type: String,
      required: true,
      unique: true,
    },
    // A planilha identifica o vendedor pelo nome: precisa ser único.
    // sparse: vendors antigos sem nome não travam a criação do índice
    vendorName: {
      type: String,
      unique: true,
      sparse: true,
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
require("../../../shared/resultCache").invalidateOnWrite(VendorSchema);

module.exports = model("Vendors", VendorSchema);
