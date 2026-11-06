const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { parseCsv, toSheetRow } = require("../features/sale/adapters/csvImportAdapter");

describe("csvImportAdapter", () => {
  describe("parseCsv", () => {
    it("CSV do Sheets (vírgula) → linhas com o nome das colunas e o número da linha", () => {
      const { headers, rows } = parseCsv("Setor,Valor da venda\nB2B,1000\nB2G,500");

      assert.deepEqual(headers, ["Setor", "Valor da venda"]);
      assert.deepEqual(rows, [
        { linha: 2, Setor: "B2B", "Valor da venda": "1000" },
        { linha: 3, Setor: "B2G", "Valor da venda": "500" },
      ]);
    });

    it("CSV do Excel em português (ponto e vírgula, BOM, \\r\\n)", () => {
      const { headers, rows } = parseCsv("﻿Setor;Valor da venda\r\nB2B;1.234,56\r\n");

      assert.deepEqual(headers, ["Setor", "Valor da venda"]);
      assert.deepEqual(rows, [{ linha: 2, Setor: "B2B", "Valor da venda": "1.234,56" }]);
    });

    it("célula entre aspas pode ter vírgula e aspas", () => {
      const { rows } = parseCsv('Passagens,Id da empresa\n"Ana, Caio","Empresa ""X"""');

      assert.equal(rows[0].Passagens, "Ana, Caio");
      assert.equal(rows[0]["Id da empresa"], 'Empresa "X"');
    });

    it("linhas vazias são descartadas, mas a numeração continua a do arquivo", () => {
      const { rows } = parseCsv("Setor,Valor da venda\n,\nB2B,10\n,,\n");

      assert.deepEqual(rows, [{ linha: 3, Setor: "B2B", "Valor da venda": "10" }]);
    });
  });

  describe("toSheetRow", () => {
    const convert = (value, date = "27/11/2026") =>
      toSheetRow({ "Valor da venda": value, "Data da venda": date }, true);

    it("valor no formato brasileiro, com ou sem R$", () => {
      assert.equal(convert("R$ 1.234,56")["Valor da venda"], 1234.56);
      assert.equal(convert("1.234")["Valor da venda"], 1234);
      assert.equal(convert("1234.5")["Valor da venda"], 1234.5);
      assert.equal(convert("1000")["Valor da venda"], 1000);
    });

    it("valor vazio ou texto → NaN (vira erro de valor inválido)", () => {
      assert.ok(Number.isNaN(convert("")["Valor da venda"]));
      assert.ok(Number.isNaN(convert("abc")["Valor da venda"]));
    });

    it("data dd/mm/aaaa → meia-noite de São Paulo", () => {
      const date = new Date(convert("10", "27/11/2026")["Data da venda"]);
      assert.equal(date.toISOString(), "2026-11-27T03:00:00.000Z");
    });

    it("data com hora", () => {
      const date = new Date(convert("10", "27/11/2026 14:30")["Data da venda"]);
      assert.equal(date.toISOString(), "2026-11-27T17:30:00.000Z");
    });

    it("data impossível (31/02) → vazia (vira erro de data inválida)", () => {
      assert.equal(convert("10", "31/02/2026")["Data da venda"], "");
    });

    it("data ISO segue como veio", () => {
      assert.equal(convert("10", "2026-11-27")["Data da venda"], "2026-11-27");
    });

    it("sem coluna Status no arquivo → Concluída; com a coluna, mantém o valor", () => {
      assert.equal(toSheetRow({}, false).Status, "Concluída");
      assert.equal(toSheetRow({ Status: "Cancelada" }, true).Status, "Cancelada");
    });
  });
});
