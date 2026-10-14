const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { translateRdObject } = require("../features/sale/adapters/rdDealAdapter");

const stageMap = {
  "stage-bf": { segment: "b2b", funnelType: "sales" },
};

const buildPayload = (stageId, status) => ({
  document: {
    id: "deal-1",
    name: "Deal 1",
    amount_total: 500,
    deal_stage: { id: stageId },
    updated_at: "2026-11-27T13:00:00.123Z",
    user: { id: "user-1" },
    status,
  },
});

describe("rdDealAdapter.translateRdObject", () => {
  it("etapa Blackfriday + status won → é venda, com segment e funnelType do mapa", () => {
    const result = translateRdObject(buildPayload("stage-bf", "won"), stageMap);

    assert.equal(result.isBlackFriday, true);
    assert.equal(result.segment, "b2b");
    assert.equal(result.funnelType, "sales");
  });

  for (const status of ["ongoing", "lost", "paused"]) {
    it(`etapa Blackfriday + status ${status} → não é venda, mas está na etapa`, () => {
      const result = translateRdObject(buildPayload("stage-bf", status), stageMap);

      assert.equal(result.isBlackFriday, false);
      assert.equal(result.isBlackFridayStage, true);
      assert.equal(result.segment, "b2b");
      assert.equal(result.funnelType, "sales");
    });
  }

  it("status won fora da etapa Blackfriday → não é venda e não traz segment/funnelType", () => {
    const result = translateRdObject(buildPayload("outra-etapa", "won"), stageMap);

    assert.equal(result.isBlackFriday, false);
    assert.equal(result.isBlackFridayStage, false);
    assert.equal(result.segment, undefined);
    assert.equal(result.funnelType, undefined);
  });

  it("deal sem deal_stage → não é venda (não quebra)", () => {
    const payload = buildPayload("stage-bf", "won");
    delete payload.document.deal_stage;

    const result = translateRdObject(payload, stageMap);

    assert.equal(result.isBlackFriday, false);
  });

  it("traduz os campos do payload e converte updated_at para Date", () => {
    const result = translateRdObject(buildPayload("stage-bf", "won"), stageMap);

    assert.equal(result.rdDealId, "deal-1");
    assert.equal(result.rdDealName, "Deal 1");
    assert.equal(result.value, 500);
    assert.equal(result.rdUserId, "user-1");
    assert.ok(result.rdUpdatedAt instanceof Date);
    assert.equal(result.rdUpdatedAt.toISOString(), "2026-11-27T13:00:00.123Z");
  });

  describe("passagem (custom field select)", () => {
    const PASSAGE_FIELD_ID = "cf-passagem";

    const buildPayloadWithFields = (customFields) => ({
      document: {
        ...buildPayload("stage-bf", "won").document,
        deal_custom_fields: customFields,
      },
    });

    const segmentField = {
      value: "Construtora",
      custom_field: { id: "cf-segmento", label: "Segmento da Empresa", type: "option" },
    };

    const passageField = (value) => ({
      value,
      custom_field: { id: PASSAGE_FIELD_ID, label: "Passagem", type: "option" },
    });

    it("campo preenchido → rdPassageName com o nome selecionado", () => {
      const payload = buildPayloadWithFields([segmentField, passageField("Victor Batilochi")]);

      const result = translateRdObject(payload, stageMap, PASSAGE_FIELD_ID);

      assert.equal(result.rdPassageName, "Victor Batilochi");
    });

    it("campo com value null (vazio na RD) → rdPassageName null", () => {
      const payload = buildPayloadWithFields([segmentField, passageField(null)]);

      const result = translateRdObject(payload, stageMap, PASSAGE_FIELD_ID);

      assert.equal(result.rdPassageName, null);
    });

    it("campo não vem na lista → rdPassageName null", () => {
      const payload = buildPayloadWithFields([segmentField]);

      const result = translateRdObject(payload, stageMap, PASSAGE_FIELD_ID);

      assert.equal(result.rdPassageName, null);
    });

    it("deal sem deal_custom_fields → rdPassageName null (não quebra)", () => {
      const result = translateRdObject(buildPayload("stage-bf", "won"), stageMap, PASSAGE_FIELD_ID);

      assert.equal(result.rdPassageName, null);
    });

    it("procura pelo id do campo, não pega o valor de outro select", () => {
      const payload = buildPayloadWithFields([segmentField]);

      const result = translateRdObject(payload, stageMap, PASSAGE_FIELD_ID);

      assert.notEqual(result.rdPassageName, "Construtora");
    });
  });

  it("não devolve mais os campos removidos (rdDealStatus, rdSdrName)", () => {
    const result = translateRdObject(buildPayload("stage-bf", "won"), stageMap);

    assert.equal("rdDealStatus" in result, false);
    assert.equal("rdSdrName" in result, false);
  });
});
