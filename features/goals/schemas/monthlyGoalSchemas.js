const zod = require("zod");

const objectId = zod.string().regex(/^[0-9a-f]{24}$/i, "Vendedor inválido");
const money = (message) => zod.number({ message }).min(0, message).max(1e10, "Valor alto demais");

const SaveMonthlyGoalSchema = zod
  .strictObject({
    goal: money("Meta do setor inválida").refine((value) => value > 0, "A meta do setor precisa ser maior que zero"),
    farmPercent: zod
      .number({ message: "Percentual de renovação inválido" })
      .min(0, "O percentual de renovação vai de 0 a 100")
      .max(100, "O percentual de renovação vai de 0 a 100"),
    superGoal: money("Super meta do setor inválida"),
    blackGoal: money("Meta black do setor inválida").nullable().optional(),
    levels: zod
      .array(
        zod.strictObject({
          key: zod.string().trim().min(1, "Nível inválido").max(40, "Nível inválido"),
          name: zod.string().trim().min(1, "Dê um nome para cada nível").max(40, "Nome do nível longo demais"),
          weight: zod.number({ message: "Peso inválido" }).gt(0, "O peso de cada nível precisa ser maior que zero").max(100, "Peso alto demais"),
        }),
      )
      .min(1, "Cadastre pelo menos um nível")
      .max(20, "Níveis demais"),
    people: zod
      .array(
        zod.strictObject({
          vendorId: objectId,
          level: zod.string().trim().min(1, "Escolha o nível de cada vendedor"),
          goal: money("Meta do vendedor inválida"),
          weeks: zod.array(money("Meta da semana inválida")).max(6, "Semanas demais"),
        }),
      )
      .max(300, "Vendedores demais"),
  })
  .refine((data) => data.superGoal > data.goal, {
    message: "A Super meta precisa ser maior que a Meta",
  });

module.exports = { SaveMonthlyGoalSchema };
