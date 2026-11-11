const zod = require("zod");

const objectId = zod.string().regex(/^[0-9a-f]{24}$/i, "Vendedor inválido");
const money = (message) => zod.number({ message }).min(0, message).max(1e10, "Valor alto demais");

// Modelo de níveis: cada nível é de um tipo (Farmer ou Venda), com Meta e Super em R$. A pessoa manda a Meta e a
// Super finais (as do nível ou ajustadas à mão). No mês com Meta black, a Black de Farmer e a de Venda são digitadas
const SaveMonthlyGoalSchema = zod.strictObject({
  levels: zod
    .array(
      zod.strictObject({
        key: zod.string().trim().min(1, "Nível inválido").max(40, "Nível inválido"),
        name: zod.string().trim().min(1, "Dê um nome para cada nível").max(40, "Nome do nível longo demais"),
        type: zod.enum(["farm", "sales"], { message: "Tipo do nível inválido" }),
        goal: money("Meta do nível inválida"),
        superGoal: money("Super meta do nível inválida"),
      }),
    )
    .min(1, "Cadastre pelo menos um nível")
    .max(40, "Níveis demais"),
  tickets: zod
    .strictObject({
      farm: money("Ticket médio de Farmer inválido").nullable(),
      sales: money("Ticket médio de Venda inválido").nullable(),
    })
    .default({ farm: null, sales: null }),
  conversion: zod
    .strictObject({
      farm: zod.number({ message: "Conversão de Farmer inválida" }).gt(0, "Conversão de Farmer inválida").max(100, "Conversão de Farmer inválida").nullable(),
      sales: zod.number({ message: "Conversão de Venda inválida" }).gt(0, "Conversão de Venda inválida").max(100, "Conversão de Venda inválida").nullable(),
    })
    .default({ farm: null, sales: null }),
  farmBlack: money("Meta black de renovação inválida").nullable().optional(),
  salesBlack: money("Meta black de vendas inválida").nullable().optional(),
  people: zod
    .array(
      zod.strictObject({
        vendorId: objectId,
        level: zod.string().trim().min(1, "Escolha o nível de cada vendedor"),
        goal: money("Meta do vendedor inválida"),
        superGoal: money("Super meta do vendedor inválida"),
        blackGoal: money("Meta black do vendedor inválida").nullable().optional(),
      }),
    )
    .max(300, "Vendedores demais"),
});

module.exports = { SaveMonthlyGoalSchema };
