// Gera o hash que o Apps Script manda no header webhook_secret.
// Uso: node crypto.js
// Copie o hash impresso para as Propriedades do script da planilha (propriedade WEBHOOK_SECRET).
// Rode de novo sempre que mudar o WEBHOOK_SECRET ou o WEBHOOK_CRYPTO_PEPPER do .env.
require("dotenv").config({ quiet: true });

const bcrypt = require("bcrypt");
const { buildWebhookSecretText } = require("./shared/webhookSecretService");

const hashWebhookSecret = async () => {
  if (!process.env.WEBHOOK_SECRET || !process.env.WEBHOOK_CRYPTO_PEPPER) {
    console.error("WEBHOOK_SECRET e WEBHOOK_CRYPTO_PEPPER precisam estar no .env");
    process.exit(1);
  }

  const hashedWebhookSecret = await bcrypt.hash(buildWebhookSecretText(), 12);

  console.log(hashedWebhookSecret);
};

hashWebhookSecret();
