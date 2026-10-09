const { Schema, model } = require("mongoose");

const RefreshTokenModel = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = model("RefreshToken", RefreshTokenModel);
