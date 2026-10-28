const zod = require("zod");

// Stacks podem ser muito longos: em vez de recusar o log, corta o texto.
// Sem coerce: com coerce, um null viraria o texto "null"
const truncate = (maxLength) =>
  zod
    .string()
    .transform((text) => text.slice(0, maxLength))
    .nullable()
    .optional();

// zod.object (e não strictObject): se o front mandar um campo novo, ele é ignorado
// em vez de recusar o log
const CreateLogSchema = zod.object({
  level: zod.coerce.string().max(20).optional(),
  message: zod.coerce.string().min(1).transform((text) => text.slice(0, 2000)),
  stack: truncate(20000),
  componentStack: truncate(20000),
  location: truncate(500),
  url: truncate(2000),
  userAgent: truncate(1000),
  occurredAt: zod.coerce.date().optional(),
});

module.exports = { CreateLogSchema };
