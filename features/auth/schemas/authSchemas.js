const zod = require("zod");

const RegisterSchema = zod
  .strictObject({
    email: zod.coerce.string().email().trim().lowercase(),
    password: zod.coerce.string().min(6),
    passwordConfirmation: zod.coerce.string(),
  })
  .superRefine((obj, ctx) => {
    if (obj.password !== obj.passwordConfirmation) {
      ctx.addIssue({
        path: ["password"],
        message: "Senhas são diferentes",
      });
    }
  });

const LoginSchema = zod.strictObject({
  email: zod.coerce.string().trim().lowercase().email(),
  password: zod.coerce.string().min(6),
});

module.exports = { RegisterSchema, LoginSchema };
