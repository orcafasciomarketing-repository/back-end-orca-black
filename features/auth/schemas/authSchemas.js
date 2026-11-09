const zod = require("zod");

const LoginSchema = zod.strictObject({
  email: zod.coerce.string().trim().lowercase().email(),
  password: zod.coerce.string().min(6),
});

// Troca da própria senha: pede a senha atual para ninguém trocar usando a sessão aberta de outra pessoa
const ChangePasswordSchema = zod
  .strictObject({
    currentPassword: zod.coerce.string().min(1),
    password: zod.coerce.string().min(6),
    passwordConfirmation: zod.coerce.string(),
  })
  .superRefine((obj, ctx) => {
    if (obj.password !== obj.passwordConfirmation) {
      ctx.addIssue({ path: ["password"], message: "Senhas são diferentes" });
    }
  });

module.exports = { LoginSchema, ChangePasswordSchema };
