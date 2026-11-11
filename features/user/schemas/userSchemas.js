const zod = require("zod");

const { MANAGE_SEGMENTS, ROLES, PERSON_ROLES } = require("../../../config/roles");

// null = todos os setores
const manageSegment = zod.enum(MANAGE_SEGMENTS, { message: "Setor inválido" }).nullable().optional();

const objectId = zod.string().regex(/^[0-9a-f]{24}$/i, "Pessoa inválida");

// Perfil de colaborador precisa dizer qual pessoa é (vendedor ou passagem)
const checkPersonLink = (obj, ctx) => {
  const field = PERSON_ROLES[obj.role];
  if (field && !obj[field]) {
    ctx.addIssue({ path: [field], message: "Escolha a pessoa ligada a essa conta" });
  }
};

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
    vendorId: objectId.optional(),
    sdrId: objectId.optional(),
    manageSegment,
  })
  .superRefine((obj, ctx) => {
    checkPasswordConfirmation(obj, ctx);
    checkPersonLink(obj, ctx);
  });

// Troca de perfil, do setor que gerencia e/ou nova senha
const UpdateUserSchema = zod
  .strictObject({
    role: zod.enum(ROLES, { message: "Perfil inválido" }).optional(),
    password: zod.coerce.string().min(6).optional(),
    passwordConfirmation: zod.coerce.string().optional(),
    vendorId: objectId.optional(),
    sdrId: objectId.optional(),
    manageSegment,
  })
  .superRefine((obj, ctx) => {
    if (obj.role === undefined && obj.password === undefined && obj.manageSegment === undefined) {
      ctx.addIssue({ path: ["role"], message: "Informe o perfil, o setor que gerencia ou a nova senha" });
    }
    checkPasswordConfirmation(obj, ctx);
    checkPersonLink(obj, ctx);
  });

module.exports = { CreateUserSchema, UpdateUserSchema };
