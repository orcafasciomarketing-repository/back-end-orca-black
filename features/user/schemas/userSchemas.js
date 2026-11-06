const zod = require("zod");

const { ROLES } = require("../../../config/roles");

const checkPasswordConfirmation = (obj, ctx) => {
  if (obj.password !== undefined && obj.password !== obj.passwordConfirmation) {
    ctx.addIssue({
      path: ["password"],
      message: "Senhas são diferentes",
    });
  }
};

// Cadastro feito pelo admin (substitui o antigo /auth/register, que era aberto)
const CreateUserSchema = zod
  .strictObject({
    // toLowerCase converte (o .lowercase() do zod 4 só confere se já está minúsculo)
    email: zod.coerce.string().trim().toLowerCase().email(),
    password: zod.coerce.string().min(6),
    passwordConfirmation: zod.coerce.string(),
    role: zod.enum(ROLES, { message: "Perfil inválido" }),
  })
  .superRefine(checkPasswordConfirmation);

// Troca de perfil e/ou nova senha
const UpdateUserSchema = zod
  .strictObject({
    role: zod.enum(ROLES, { message: "Perfil inválido" }).optional(),
    password: zod.coerce.string().min(6).optional(),
    passwordConfirmation: zod.coerce.string().optional(),
  })
  .superRefine((obj, ctx) => {
    if (obj.role === undefined && obj.password === undefined) {
      ctx.addIssue({ path: ["role"], message: "Informe o perfil ou a nova senha" });
    }
    checkPasswordConfirmation(obj, ctx);
  });

module.exports = { CreateUserSchema, UpdateUserSchema };
