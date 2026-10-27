const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildSheetRow,
  sendSheet,
} = require("./helpers/testApp");

const { addClient } = require("../shared/sseManager");

const T1 = "2026-11-27T13:00:00.100Z";
const T2 = "2026-11-27T13:05:00.200Z";
const T3 = "2026-11-27T13:10:00.300Z";

const SALE_UPDATED = { type: "sale-updated" };

describe("Eventos SSE da planilha (/sales/events)", () => {
  let testApp;
  let events;
  let fakeRequest;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  // Cliente SSE falso: guarda o JSON de cada mensagem enviada pelo broadcast
  beforeEach(async () => {
    await clearDatabase();
    await seedBase();

    events = [];
    fakeRequest = new EventEmitter();
    const fakeResponse = {
      write: (chunk) => events.push(JSON.parse(chunk.replace(/^data: /, "").trim())),
    };
    addClient(fakeResponse, fakeRequest);
  });

  // Desconecta o cliente falso, como o navegador faz ao fechar a aba
  afterEach(() => {
    fakeRequest.emit("close");
  });

  describe("venda nova → evento do popup", () => {
    it("com passagem: { sale, vendor, sdrs, sdr } só com os campos que o popup usa", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "SDR B" }));

      assert.equal(events.length, 1);
      const [event] = events;

      assert.deepEqual(Object.keys(event.sale).sort(), ["_id", "funnelType"]);
      assert.equal(event.sale.funnelType, "sales");
      assert.deepEqual(event.vendor, { vendorName: "Vendor A1", job: "Executivo Venda" });
      assert.deepEqual(event.sdrs, [{ name: "SDR B", job: "sdr" }]);
      // Compatibilidade com o popup atual do front, que lê só "sdr"
      assert.deepEqual(event.sdr, { name: "SDR B", job: "sdr" });
    });

    it("várias passagens: sdrs com todas as pessoas e sdr com a primeira", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "Suporte C, SDR B" }));

      const [event] = events;
      assert.deepEqual(event.sdrs, [
        { name: "Suporte C", job: "suporte" },
        { name: "SDR B", job: "sdr" },
      ]);
      assert.deepEqual(event.sdr, { name: "Suporte C", job: "suporte" });
    });

    it("sem passagem: evento sem as chaves sdr e sdrs", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow());

      assert.equal(events.length, 1);
      assert.equal("sdr" in events[0], false);
      assert.equal("sdrs" in events[0], false);
    });

    it("renovação: funnelType farm (o front mostra \"+1 Renovação\")", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ classification: "Renovação" }));

      assert.equal(events[0].sale.funnelType, "farm");
    });

    it("não vaza dados que o popup não usa (valor, empresa, id da venda)", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ value: 99999, company: "Empresa Secreta" }));
      const json = JSON.stringify(events[0]);

      assert.equal(json.includes("99999"), false);
      assert.equal(json.includes("Empresa Secreta"), false);
      assert.equal(json.includes("venda-1"), false);
    });

    it("lote com 2 vendas novas → 2 popups", async () => {
      await sendSheet(testApp.baseUrl, [
        buildSheetRow({ id: "venda-1" }),
        buildSheetRow({ id: "venda-2", vendor: "Vendor B1" }),
      ]);

      assert.deepEqual(
        events.map((event) => event.vendor.vendorName),
        ["Vendor A1", "Vendor B1"],
      );
    });
  });

  describe("venda alterada → { type: \"sale-updated\" } (atualiza as telas, sem popup)", () => {
    it("valor corrigido", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1000 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, value: 1500 }));

      assert.deepEqual(events.slice(1), [SALE_UPDATED]);
    });

    it("cancelada", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Cancelada" }));

      assert.deepEqual(events.slice(1), [SALE_UPDATED]);
    });

    it("reativação não abre popup de novo", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Cancelada" }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T3 }));

      assert.deepEqual(events.slice(1), [SALE_UPDATED, SALE_UPDATED]);
    });

    it("sincronização reenviando várias vendas já existentes → um único aviso", async () => {
      const rows = ["venda-1", "venda-2", "venda-3"].map((id) => buildSheetRow({ id, updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, rows);
      events = [];

      await sendSheet(
        testApp.baseUrl,
        rows.map((row) => ({ ...row, "Atualizado em": T2 })),
      );

      assert.deepEqual(events, [SALE_UPDATED]);
    });

    it("mesma linha enviada várias vezes ao mesmo tempo → um único popup", async () => {
      const row = buildSheetRow({ updatedAt: T1 });

      await Promise.all(Array.from({ length: 5 }, () => sendSheet(testApp.baseUrl, row)));

      assert.equal(events.filter((event) => event.sale).length, 1);
    });
  });

  describe("nada mudou no banco → nenhum evento", () => {
    it("linha cancelada que nunca foi concluída", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ status: "Cancelada" }));

      assert.deepEqual(events, []);
    });

    it("linha com erro (vendedor não cadastrado)", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ vendor: "Pessoa Desconhecida" }));

      assert.deepEqual(events, []);
    });

    it("envio antigo chegando atrasado", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 5 }));

      assert.equal(events.length, 1);
    });

    it("venda já cancelada cancelada de novo com dados faltando", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Cancelada", vendor: "" }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T3, status: "Cancelada", vendor: "" }));

      assert.equal(events.length, 2);
    });
  });

  it("conexão real em GET /sales/events recebe a mensagem no formato SSE (data: <json>)", async () => {
    const controller = new AbortController();
    const res = await fetch(`${testApp.baseUrl}/sales/events`, { signal: controller.signal });
    const reader = res.body.getReader();

    assert.equal(res.headers.get("content-type"), "text/event-stream");

    await sendSheet(testApp.baseUrl, buildSheetRow());
    const { value } = await reader.read();
    const message = new TextDecoder().decode(value);
    controller.abort();

    assert.match(message, /^data: \{.*\}\n\n$/);
    const event = JSON.parse(message.slice("data: ".length));
    assert.equal(event.vendor.vendorName, "Vendor A1");
  });
});
