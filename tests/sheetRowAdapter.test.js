const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  translateSheetRow,
  findSaleDataErrors,
} = require("../features/sale/adapters/sheetRowAdapter");

// Linha no formato do print da planilha, mais as colunas que o Apps Script acrescenta
const buildRow = (overrides = {}) => ({
  linha: 2,
  "Id da empresa": "teste",
  Passagens: "",
  Vendedor: "Renan Souza",
  Setor: "B2B",
  "Classificação": "Renovação",
  "Valor da venda": 10000,
  "Data da venda": "2026-10-03T03:00:00.000Z",
  Status: "Concluída",
  "Id da venda": "uuid-1",
  "Atualizado em": "2026-10-27T15:00:00.000Z",
  ...overrides,
});

describe("sheetRowAdapter.translateSheetRow", () => {
  it("traduz a linha do print para o objeto de venda do sistema", () => {
    const sale = translateSheetRow(buildRow());

    assert.deepEqual(sale, {
      rdDealId: "uuid-1",
      rdDealName: "teste",
      rdUpdatedAt: new Date("2026-10-27T15:00:00.000Z"),
      realizedAt: new Date("2026-10-03T03:00:00.000Z"),
      value: 10000,
      vendorName: "Renan Souza",
      rdPassageNames: [],
      segment: "b2b",
      funnelType: "farm",
      isConcluded: true,
      sheetRow: 2,
    });
  });

  describe("Status", () => {
    for (const status of ["Concluída", "concluida", " CONCLUÍDA "]) {
      it(`"${status}" → concluída (ignora acento, maiúscula e espaço)`, () => {
        assert.equal(translateSheetRow(buildRow({ Status: status })).isConcluded, true);
      });
    }

    for (const status of ["Cancelada", "Em andamento", ""]) {
      it(`"${status}" → não concluída`, () => {
        assert.equal(translateSheetRow(buildRow({ Status: status })).isConcluded, false);
      });
    }
  });

  describe("Classificação", () => {
    for (const [classification, funnelType] of [
      ["Renovação", "farm"],
      ["renovacao", "farm"],
      ["", "sales"],
      [undefined, "sales"],
    ]) {
      it(`${JSON.stringify(classification)} → ${funnelType}`, () => {
        assert.equal(
          translateSheetRow(buildRow({ "Classificação": classification })).funnelType,
          funnelType,
        );
      });
    }
  });

  describe("Setor", () => {
    for (const [sector, segment] of [
      ["B2B", "b2b"],
      ["b2g", "b2g"],
      [" B2G ", "b2g"],
      ["GOV", null],
      ["", null],
    ]) {
      it(`${JSON.stringify(sector)} → ${segment}`, () => {
        assert.equal(translateSheetRow(buildRow({ Setor: sector })).segment, segment);
      });
    }
  });

  describe("Passagens", () => {
    for (const [passages, names] of [
      ["", []],
      [null, []],
      ["Ana", ["Ana"]],
      ["Ana, Caio", ["Ana", "Caio"]],
      ["Ana,Caio , ", ["Ana", "Caio"]],
      ["Ana, Caio, Ana", ["Ana", "Caio"]],
      [["Ana", "Caio"], ["Ana", "Caio"]],
    ]) {
      it(`${JSON.stringify(passages)} → ${JSON.stringify(names)}`, () => {
        assert.deepEqual(translateSheetRow(buildRow({ Passagens: passages })).rdPassageNames, names);
      });
    }
  });

  it("valor como texto numérico é convertido", () => {
    assert.equal(translateSheetRow(buildRow({ "Valor da venda": "1500.5" })).value, 1500.5);
  });

  it("datas vazias ou inválidas viram null", () => {
    const sale = translateSheetRow(buildRow({ "Data da venda": "", "Atualizado em": "ontem" }));

    assert.equal(sale.realizedAt, null);
    assert.equal(sale.rdUpdatedAt, null);
  });

  it("linha sem Id da venda → rdDealId vazio", () => {
    const row = buildRow();
    delete row["Id da venda"];

    assert.equal(translateSheetRow(row).rdDealId, "");
  });
});

describe("sheetRowAdapter.findSaleDataErrors", () => {
  it("linha completa → sem problemas", () => {
    assert.deepEqual(findSaleDataErrors(translateSheetRow(buildRow())), []);
  });

  it("lista todos os problemas da linha", () => {
    const sale = translateSheetRow(
      buildRow({ Vendedor: "", Setor: "GOV", "Valor da venda": "", "Data da venda": "" }),
    );

    assert.deepEqual(findSaleDataErrors(sale), [
      "Vendedor vazio",
      "Setor precisa ser B2B ou B2G",
      "Valor da venda inválido",
      "Data da venda inválida",
    ]);
  });

  it("valor negativo → inválido", () => {
    const sale = translateSheetRow(buildRow({ "Valor da venda": -10 }));

    assert.deepEqual(findSaleDataErrors(sale), ["Valor da venda inválido"]);
  });
});
