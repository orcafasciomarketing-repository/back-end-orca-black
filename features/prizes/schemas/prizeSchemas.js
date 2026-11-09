const zod = require("zod");

const objectId = zod.string().regex(/^[0-9a-f]{24}$/i, "Pessoa inválida");

// AAAA-MM-DD que existe no calendário (2026-02-30 não passa)
const isRealDay = (day) => new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
const day = zod
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isRealDay, "Data inválida");

const CreateWithdrawalSchema = zod.strictObject({
  personId: objectId,
  kind: zod.enum(["vendor", "sdr"], { message: "Tipo de pessoa inválido" }),
  quantity: zod.coerce
    .number()
    .int("A quantidade precisa ser um número inteiro")
    .min(1, "A quantidade precisa ser pelo menos 1")
    .max(100, "Quantidade alta demais"),
  withdrawnAt: day,
  // Retirada acima do saldo só passa com a confirmação de quem registra
  confirmOverBalance: zod.boolean().optional(),
});

module.exports = { CreateWithdrawalSchema };
