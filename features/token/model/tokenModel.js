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
      unique: true,
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
    // Quando foi trocado por um novo no /auth/refresh (para a tolerância entre abas)
    rotatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Token vencido é apagado sozinho pelo MongoDB
RefreshTokenModel.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model("RefreshToken", RefreshTokenModel);
