const zod = require("zod");

const CreateSalesSchema = zod.strictObject({
  vendor: zod.coerce.string(),
  value: zod.coerce.number().nonnegative().optional(),
  sdrId: zod.coerce.string().transform((val) => (val === "" ? undefined : val)).optional(),
  realizedAt: zod.coerce.date(),
});

const UpdateSalesSchema = zod.strictObject({
  vendor: zod.coerce.string().optional(),
  value: zod.coerce.number().nonnegative().optional(),
  sdrId: zod.coerce.string().transform((val) => (val === "" ? undefined : val)).optional(),
  realizedAt: zod.coerce.date().optional(),
});

module.exports = { CreateSalesSchema, UpdateSalesSchema };
