const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  startTestApp,
  createUserToken,
  seedBase,
  clearDatabase,
  buildSheetRow,
  sendSheet,
  TEST_POINTS,
} = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const { addClient } = require("../shared/sseManager");

const HEADER = "Id da empresa,Vendedor,Passagens,Setor,Classificação,Valor da venda,Data da venda";

// Monta o CSV com o cabeçalho padrão; cada linha é uma string já separada por vírgula
const buildCsv = (...lines) => [HEADER, ...lines].join("\n");

describe("Importação de vendas pelo admin (POST /sales/import)", () => {
  let testApp;
  let adminToken;
  let seed;

  before(async () => {
    testApp = await startTestApp();
    adminToken = await createUserToken("admin");
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    seed = await seedBase();
  });

  const adminHeaders = () => ({
    "Content-Type": "text/csv",
    Authorization: `Bearer ${adminToken}`,
  });

  const post = async (path, csv, headers = adminHeaders()) => {
    const res = await fetch(`${testApp.baseUrl}${path}`, { method: "POST", headers, body: csv });
    return { status: res.status, body: await res.json() };
  };

  const preview = (csv) => post("/sales/import/preview", csv);
  const importCsv = (csv) => post("/sales/import", csv);

  const getData = async (path) => {
    const res = await fetch(`${testApp.baseUrl}${path}`);
    return (await res.json()).data;
  };

  const importedSales = async () => await Sales.find({ source: "importacao" }).lean();

  describe("login", () => {
    for (const path of ["/sales/import/preview", "/sales/import"]) {
      it(`POST ${path} sem token → 401 e nada é gravado`, async () => {
        const { status } = await post(path, buildCsv("Empresa X,,,B2B,,1000,27/11/2026"), {
          "Content-Type": "text/csv",
        });

        assert.equal(status, 401);
        assert.equal(await Sales.countDocuments(), 0);
      });
    }
  });

  describe("venda sem vendedor", () => {
    it("é gravada ativa, sem vendedor e sem passagem, marcada como importação", async () => {
      const { status } = await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));
      const [sale] = await importedSales();

      assert.equal(status, 200);
      assert.equal(sale.vendorId, null);
      assert.deepEqual(sale.sdrIds, []);
      assert.equal(sale.dealStatus, "ativa");
      assert.equal(sale.segment, "b2b");
      assert.equal(sale.funnelType, "sales");
      assert.equal(sale.rdDealName, "Empresa X");
      assert.equal(sale.value, 1000);
      assert.equal(sale.realizedAt.toISOString(), "2026-11-27T03:00:00.000Z");
    });

    it("conta na meta", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ value: 1000 }));
      await importCsv(buildCsv("Empresa X,,,B2B,,2500,27/11/2026"));

      const goal = await getData("/analytics/goal");

      assert.equal(goal.total, 3500);
    });

    it("não dá pontos para nenhum time nem entra nos rankings", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026", "Empresa Y,,,B2G,Renovação,500,27/11/2026"));

      const scoreboard = await getData("/analytics/scoreboard");
      const salesRanking = await getData("/analytics/ranking");
      const farmRanking = await getData("/analytics/ranking?vendorDepartment=farm");
      const sdrRanking = await getData("/analytics/sdr-ranking");

      assert.ok(scoreboard.every((team) => team.total === 0));
      assert.deepEqual(salesRanking.vendor, []);
      assert.deepEqual(farmRanking.vendor, []);
      assert.deepEqual(sdrRanking, []);
    });

    it("com passagem → erro, nada é gravado", async () => {
      const { status, body } = await importCsv(buildCsv("Empresa X,,SDR B,B2B,,1000,27/11/2026"));

      assert.equal(status, 400);
      assert.deepEqual(body.data.errors, [{ linha: 2, mensagem: "Venda sem vendedor não pode ter passagem" }]);
      assert.equal(await Sales.countDocuments(), 0);
    });
  });

  describe("venda com vendedor (reconhecida como na planilha)", () => {
    it("vendedor e passagem pontuam normalmente", async () => {
      await importCsv(buildCsv("Empresa X,Vendor A1,SDR B,B2B,,1000,27/11/2026"));

      const scoreboard = await getData("/analytics/scoreboard");
      const teamA = scoreboard.find((team) => team.teamName === "Time A");
      const teamB = scoreboard.find((team) => team.teamName === "Time B");
      const ranking = await getData("/analytics/ranking");
      const sdrRanking = await getData("/analytics/sdr-ranking");

      assert.equal(teamA.sales, TEST_POINTS.b2bSale);
      assert.equal(teamB.passage, TEST_POINTS.b2bSdr);
      assert.equal(ranking.vendor[0].name, "Vendor A1");
      assert.equal(sdrRanking[0].name, "SDR B");
    });

    it("vendedor não cadastrado → erro, nada é gravado", async () => {
      const { status, body } = await importCsv(buildCsv("Empresa X,Fulano,,B2B,,1000,27/11/2026"));

      assert.equal(status, 400);
      assert.equal(body.data.errors[0].mensagem, 'Vendedor "Fulano" não cadastrado');
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("passagem com nome não cadastrado → aviso, a venda entra com os nomes conhecidos", async () => {
      const { status, body } = await importCsv(
        buildCsv('Empresa X,Vendor A1,"SDR B, Ninguém",B2B,,1000,27/11/2026'),
      );
      const [sale] = await importedSales();

      assert.equal(status, 200);
      assert.deepEqual(body.data.warnings, [
        { linha: 2, mensagem: 'Passagem não cadastrada (descartada): "Ninguém"' },
      ]);
      assert.deepEqual(sale.sdrIds.map(String), [String(seed.sdrB._id)]);
    });
  });

  describe("validação do arquivo", () => {
    it("qualquer linha com erro → nada é gravado e todos os erros voltam", async () => {
      const { status, body } = await importCsv(
        buildCsv("Empresa X,,,B2B,,1000,27/11/2026", "Empresa Y,,,B2C,,abc,31/02/2026"),
      );

      assert.equal(status, 400);
      assert.deepEqual(body.data.errors, [
        {
          linha: 3,
          mensagem: "Setor precisa ser B2B ou B2G; Valor da venda inválido; Data da venda inválida",
        },
      ]);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("coluna obrigatória faltando → erro na linha 1", async () => {
      const { status, body } = await importCsv("Setor,Valor da venda\nB2B,1000");

      assert.equal(status, 400);
      assert.deepEqual(body.data.errors, [{ linha: 1, mensagem: 'Coluna não encontrada: "Data da venda"' }]);
    });

    it("arquivo vazio → 400", async () => {
      const { status, body } = await importCsv("");

      assert.equal(status, 400);
      assert.equal(body.error, "Arquivo vazio");
    });

    it("só cabeçalho → 400 e nada é apagado", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));

      const { status } = await importCsv(buildCsv());

      assert.equal(status, 400);
      assert.equal((await importedSales()).length, 1);
    });

    it("com coluna Status: só Concluída entra, o resto é ignorado (e listado)", async () => {
      const csv = [
        "Setor,Valor da venda,Data da venda,Status",
        "B2B,1000,27/11/2026,Concluída",
        "B2B,2000,27/11/2026,Cancelada",
      ].join("\n");

      const { body } = await importCsv(csv);
      const sales = await importedSales();

      assert.equal(sales.length, 1);
      assert.equal(sales[0].value, 1000);
      assert.deepEqual(body.data.ignored, [{ linha: 3, mensagem: "Status diferente de Concluída" }]);
    });

    it("CSV do Excel (ponto e vírgula, R$ e milhar com ponto)", async () => {
      const csv = "Setor;Valor da venda;Data da venda\r\nB2G;R$ 1.234,56;27/11/2026\r\n";

      const { status } = await importCsv(csv);
      const [sale] = await importedSales();

      assert.equal(status, 200);
      assert.equal(sale.value, 1234.56);
      assert.equal(sale.segment, "b2g");
    });
  });

  describe("prévia", () => {
    it("não grava nada e compara a importação atual com o arquivo", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));

      const { status, body } = await preview(
        buildCsv("Empresa X,,,B2B,,1500,27/11/2026", "Empresa Y,Vendor A1,,B2G,,500,27/11/2026"),
      );

      assert.equal(status, 200);
      assert.deepEqual(body.data.current, { count: 1, total: 1000 });
      assert.deepEqual(body.data.file, { count: 2, total: 2000, withVendor: 1, withoutVendor: 1 });
      assert.equal((await importedSales())[0].value, 1000);
    });

    it("arquivo com erro → 200 com os erros (a prévia nunca grava)", async () => {
      const { status, body } = await preview(buildCsv("Empresa X,,,B2B,,abc,27/11/2026"));

      assert.equal(status, 200);
      assert.equal(body.data.errors.length, 1);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("avisa venda que parece já existir na planilha (mesma empresa, valor e dia)", async () => {
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ company: "Empresa X", value: 1000, saleDate: "2026-11-27T03:00:00.000Z" }),
      );

      const { body } = await preview(buildCsv("Empresa X,,,B2B,,1000,27/11/2026", "Empresa Z,,,B2B,,1000,27/11/2026"));

      assert.deepEqual(body.data.duplicates, [{ linha: 2, mensagem: "Parece já existir na planilha (Empresa X)" }]);
    });

    it("avisa venda com o mesmo Id da venda da planilha (arquivo exportado da planilha)", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ id: "venda-1", company: "Empresa X" }));

      const { body } = await preview(
        ["Id da venda,Setor,Valor da venda,Data da venda", "venda-1,B2B,999,01/12/2026"].join("\n"),
      );

      assert.equal(body.data.duplicates.length, 1);
    });
  });

  describe("substituição a cada importação", () => {
    it("o arquivo novo substitui o anterior: corrige valor, adiciona e remove", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026", "Empresa Y,,,B2B,,500,27/11/2026"));

      await importCsv(buildCsv("Empresa X,,,B2B,,1200,27/11/2026", "Empresa Z,,,B2G,,300,27/11/2026"));
      const sales = await importedSales();
      const valueByCompany = Object.fromEntries(sales.map((sale) => [sale.rdDealName, sale.value]));

      assert.deepEqual(valueByCompany, { "Empresa X": 1200, "Empresa Z": 300 });
    });

    it("importar o mesmo arquivo duas vezes não duplica", async () => {
      const csv = buildCsv("Empresa X,,,B2B,,1000,27/11/2026");

      await importCsv(csv);
      await importCsv(csv);

      assert.equal((await importedSales()).length, 1);
      assert.equal((await getData("/analytics/goal")).total, 1000);
    });

    it("venda que passou a ter vendedor: importar de novo com o nome → pontua", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));
      await importCsv(buildCsv("Empresa X,Vendor A1,,B2B,,1000,27/11/2026"));

      const scoreboard = await getData("/analytics/scoreboard");

      assert.equal(scoreboard.find((team) => team.teamName === "Time A").sales, TEST_POINTS.b2bSale);
      assert.equal((await getData("/analytics/goal")).total, 1000);
    });

    it("arquivo com erro → a importação anterior continua valendo", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));

      await importCsv(buildCsv("Empresa X,,,B2B,abc,abc,27/11/2026"));

      const sales = await importedSales();
      assert.equal(sales.length, 1);
      assert.equal(sales[0].value, 1000);
    });

    it("nunca mexe nas vendas da planilha", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ id: "da-planilha", value: 700 }));

      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));
      await importCsv(buildCsv("Empresa Y,,,B2B,,2000,27/11/2026"));

      const sheetSale = await Sales.findOne({ rdDealId: "da-planilha" }).lean();
      assert.equal(sheetSale.value, 700);
      assert.equal(sheetSale.source, "planilha");
      assert.equal((await getData("/analytics/goal")).total, 2700);
    });

    it("a sincronização da planilha não mexe nas vendas importadas", async () => {
      await importCsv(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));

      await sendSheet(testApp.baseUrl, [buildSheetRow({ id: "venda-1" }), buildSheetRow({ id: "venda-2" })]);

      assert.equal((await importedSales()).length, 1);
    });
  });

  describe("planilha continua igual", () => {
    it("venda da planilha com Vendedor vazio continua dando erro", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow({ vendor: "" }));
      const body = await res.json();

      assert.equal(body.data[0].status, "erro");
      assert.match(body.data[0].mensagem, /Vendedor vazio/);
      assert.equal(await Sales.countDocuments(), 0);
    });
  });

  describe("telas (SSE)", () => {
    let events;
    let fakeRequest;

    beforeEach(() => {
      events = [];
      fakeRequest = new EventEmitter();
      addClient(
        { write: (chunk) => events.push(JSON.parse(chunk.replace(/^data: /, "").trim())) },
        fakeRequest,
      );
    });

    afterEach(() => {
      fakeRequest.emit("close");
    });

    it("importação → um único sale-updated, sem popup (mesmo com vendedor)", async () => {
      await importCsv(buildCsv("Empresa X,Vendor A1,,B2B,,1000,27/11/2026", "Empresa Y,,,B2B,,500,27/11/2026"));

      assert.deepEqual(events, [{ type: "sale-updated" }]);
    });

    it("prévia e importação com erro → nenhum evento", async () => {
      await preview(buildCsv("Empresa X,,,B2B,,1000,27/11/2026"));
      await importCsv(buildCsv("Empresa X,,,B2B,,abc,27/11/2026"));

      assert.deepEqual(events, []);
    });
  });
});
