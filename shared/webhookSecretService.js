const { timingSafeEqual } = require("node:crypto");

// O Apps Script manda no header o mesmo WEBHOOK_SECRET que está no .env do servidor

exports.isValidWebhookSecret = (receivedSecret) => {
  // Sem segredo no servidor, recusa tudo
  if (!process.env.WEBHOOK_SECRET) return false;
  if (typeof receivedSecret !== "string") return false;

  const expected = Buffer.from(process.env.WEBHOOK_SECRET);
  const received = Buffer.from(receivedSecret);

  // timingSafeEqual leva o mesmo tempo acertando ou errando, então ninguém
  // descobre o segredo medindo a demora da resposta. Ele exige tamanhos iguais
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
};
