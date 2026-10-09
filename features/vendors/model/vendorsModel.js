const { Schema, model } = require("mongoose");

const VendorSchema = new Schema(
  {
    rdUserId: {
      type: String,
      required: true,
    },
    vendorName: {
      type: String,
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

module.exports = model("Vendors", VendorSchema);
