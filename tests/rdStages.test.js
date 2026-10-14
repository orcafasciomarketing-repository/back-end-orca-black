const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");

// Uma etapa vazia e outra ausente, definidas antes do require (o mapa é montado ao carregar)
process.env.B2B_FUNIL_BLACKFRIDAY_SALES = "stage-b2b-sales";
process.env.B2B_FUNIL_BLACKFRIDAY_FARM = "";
delete process.env.B2G_FUNIL_BLACKFRIDAY_SALES;
process.env.B2G_FUNIL_BLACKFRIDAY_FARM = "stage-b2g-farm";

const warnMock = mock.method(console, "warn", () => {});
const { STAGE_MAP } = require("../config/rdStages");

describe("config/rdStages STAGE_MAP", () => {
  it("só tem as etapas configuradas", () => {
    assert.deepEqual(STAGE_MAP, {
      "stage-b2b-sales": { segment: "b2b", funnelType: "sales" },
      "stage-b2g-farm": { segment: "b2g", funnelType: "farm" },
    });
  });

  it("não cria chaves \"undefined\" nem \"\" (deal sem etapa não vira Blackfriday)", () => {
    assert.equal("undefined" in STAGE_MAP, false);
    assert.equal("" in STAGE_MAP, false);
  });

  it("avisa no console quais variáveis de etapa estão faltando", () => {
    assert.equal(warnMock.mock.callCount(), 1);
    const message = warnMock.mock.calls[0].arguments[0];
    assert.ok(message.includes("B2B_FUNIL_BLACKFRIDAY_FARM"));
    assert.ok(message.includes("B2G_FUNIL_BLACKFRIDAY_SALES"));
  });
});
