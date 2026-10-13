const bcrypt = require("bcrypt");

const hashWebhookSecret = async () => {
  const hashedWebhookSecret = await bcrypt.hash(
    `
    ${process.env.WEBHOOK_SECRET}${process.env.WEBHOOK_CRYPTO_PEPPER}`,
    Number(12),
  );

  console.log(hashedWebhookSecret);
};

hashWebhookSecret();
