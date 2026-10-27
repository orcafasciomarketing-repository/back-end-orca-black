const bcrypt = require("bcrypt");

// O Apps Script não manda o WEBHOOK_SECRET: manda o hash bcrypt de (segredo + pepper),
// gerado uma vez com `node crypto.js`. Se o segredo vazar sozinho, ainda falta o pepper
// para gerar um hash que o backend aceite.

// Texto que vira hash. O crypto.js e a comparação usam esta mesma função,
// senão qualquer diferença (um espaço, uma quebra de linha) faz o hash nunca bater
const buildWebhookSecretText = () =>
  `${process.env.WEBHOOK_SECRET}${process.env.WEBHOOK_CRYPTO_PEPPER}`;

// Formato de um hash bcrypt: $2a$/$2b$/$2y$ + custo + 53 caracteres
const BCRYPT_HASH_FORMAT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// O bcrypt.compare leva ~250 ms de CPU (custo 12). O Apps Script manda sempre o mesmo
// hash, então o último hash aceito fica guardado e as próximas requisições não pagam esse custo
let lastValidHash = null;

exports.buildWebhookSecretText = buildWebhookSecretText;

exports.isValidWebhookSecret = async (receivedHash) => {
  // Sem segredo ou sem pepper no servidor, recusa tudo
  if (!process.env.WEBHOOK_SECRET || !process.env.WEBHOOK_CRYPTO_PEPPER) return false;

  // Qualquer coisa que não é um hash bcrypt é recusada sem rodar o bcrypt
  // (inclusive o segredo em texto puro)
  if (typeof receivedHash !== "string" || !BCRYPT_HASH_FORMAT.test(receivedHash)) {
    return false;
  }

  if (receivedHash === lastValidHash) return true;

  const isValid = await bcrypt.compare(buildWebhookSecretText(), receivedHash);
  if (isValid) lastValidHash = receivedHash;

  return isValid;
};

// Só para os testes: esquece o hash guardado
exports.resetWebhookSecretCache = () => {
  lastValidHash = null;
};
