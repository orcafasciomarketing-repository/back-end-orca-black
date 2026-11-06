const zod = require("zod");

const LoginSchema = zod.strictObject({
  email: zod.coerce.string().trim().lowercase().email(),
  password: zod.coerce.string().min(6),
});

module.exports = { LoginSchema };
