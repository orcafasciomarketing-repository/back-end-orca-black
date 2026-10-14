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

module.exports = model("SDR", sdrSchema);
