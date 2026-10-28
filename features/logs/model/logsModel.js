const { Schema, model } = require("mongoose");

// Logs são apagados sozinhos depois de 30 dias (a campanha dura cerca de 1 mês)
const LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

const logSchema = new Schema(
  {
    level: {
      type: String,
      default: "error",
    },
    message: {
      type: String,
      required: true,
    },
    stack: {
      type: String,
    },
    componentStack: {
      type: String,
    },
    location: {
      type: String,
    },
    url: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    // Horário do erro, pelo relógio da TV. O horário em que o backend recebeu é o createdAt
    occurredAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

logSchema.index({ createdAt: 1 }, { expireAfterSeconds: LOG_TTL_SECONDS });

module.exports = model("Logs", logSchema);
