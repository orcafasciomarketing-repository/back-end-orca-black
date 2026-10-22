const { describe, it, before, after, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildRdPayload,
  sendWebhook,
  TEST_STAGES,
} = require("./helpers/testApp");

const { addClient } = require("../shared/sseManager");

const T1 = "2026-11-27T13:00:00.100Z";
const T2 = "2026-11-27T13:05:00.200Z";
const T3 = "2026-11-27T13:10:00.300Z";

const SALE_UPDATED = { type: "sale-updated" };

describe("Eventos SSE do webhook (/sales/events)", () => {
  let testApp;
  let seed;
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
    seed = await seedBase();

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
    it("com passagem: { sale, vendor, sdr } só com os campos que o popup usa", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ passageName: "SDR B" }));

      assert.equal(events.length, 1);
      const [event] = events;

      assert.deepEqual(Object.keys(event.sale).sort(), ["_id", "funnelType"]);
      assert.equal(event.sale.funnelType, "sales");
      assert.deepEqual(event.vendor, {
        vendorName: "Vendor A1",
        job: "Executivo Venda",
      });
      assert.deepEqual(event.sdr, { name: "SDR B", job: "sdr" });
    });

    it("sem passagem: evento sem a chave sdr", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload());

      assert.equal(events.length, 1);
      assert.equal("sdr" in events[0], false);
      assert.ok(events[0].sale && events[0].vendor);
    });

    it("renovação: funnelType farm (o front mostra \"+1 Renovação\")", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ stageId: TEST_STAGES.B2B_FARM }));

      assert.equal(events[0].sale.funnelType, "farm");
    });

    it("não vaza dados que o popup não usa (valor, ids da RD)", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ amount: 99999 }));
      const json = JSON.stringify(events[0]);

      assert.equal(json.includes("99999"), false);
      assert.equal(json.includes("rd-user-a1"), false);
      assert.equal(json.includes("rd-deal-1"), false);
    });
  });

  describe("venda alterada → { type: \"sale-updated\" } (atualiza as telas, sem popup)", () => {
    it("valor corrigido", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, amount: 1500 }));

      assert.deepEqual(events[1], SALE_UPDATED);
      assert.equal(events.length, 2);
    });

    it("deal sai da etapa (cancelamento)", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T2, stageId: TEST_STAGES.OUTSIDE }),
      );

      assert.deepEqual(events[1], SALE_UPDATED);
    });

    it("deal perdido ainda na etapa (cancelamento com dados atualizados)", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost" }));

      assert.deepEqual(events[1], SALE_UPDATED);
    });

    it("reativação não abre popup de novo", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T3 }));

      assert.deepEqual(events.slice(1), [SALE_UPDATED, SALE_UPDATED]);
    });

    it("reenvio do mesmo evento não abre popup de novo", async () => {
      const payload = buildRdPayload({ updatedAt: T1 });

      await sendWebhook(testApp.baseUrl, payload);
      await sendWebhook(testApp.baseUrl, payload);

      const newSaleEvents = events.filter((event) => event.sale);
      assert.equal(newSaleEvents.length, 1);
    });

    it("vários eventos iguais ao mesmo tempo → um único popup", async () => {
      const payload = buildRdPayload({ updatedAt: T1 });

      await Promise.all(
        Array.from({ length: 5 }, () => sendWebhook(testApp.baseUrl, payload)),
      );

      const newSaleEvents = events.filter((event) => event.sale);
      assert.equal(newSaleEvents.length, 1);
    });
  });

  describe("nada mudou no banco → nenhum evento", () => {
    it("deal de outro funil que nunca foi venda", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ stageId: TEST_STAGES.OUTSIDE }));

      assert.deepEqual(events, []);
    });

    it("deal na etapa que nunca foi ganho", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ status: "ongoing" }));

      assert.deepEqual(events, []);
    });

    it("venda já cancelada recebendo outro evento de fora da etapa", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, stageId: TEST_STAGES.OUTSIDE }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T3, stageId: TEST_STAGES.OUTSIDE }));

      assert.equal(events.length, 2);
    });

    it("evento antigo chegando atrasado", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 5 }));

      assert.equal(events.length, 1);
    });

    it("dono do deal não cadastrado como vendor", async () => {
      const warnMock = mock.method(console, "warn", () => {});

      await sendWebhook(testApp.baseUrl, buildRdPayload({ rdUserId: "rd-user-inexistente" }));

      assert.deepEqual(events, []);
      warnMock.mock.restore();
    });
  });

  it("conexão real em GET /sales/events recebe a mensagem no formato SSE (data: <json>)", async () => {
    const controller = new AbortController();
    const res = await fetch(`${testApp.baseUrl}/sales/events`, { signal: controller.signal });
    const reader = res.body.getReader();

    assert.equal(res.headers.get("content-type"), "text/event-stream");

    await sendWebhook(testApp.baseUrl, buildRdPayload());
    const { value } = await reader.read();
    const message = new TextDecoder().decode(value);
    controller.abort();

    assert.match(message, /^data: \{.*\}\n\n$/);
    const event = JSON.parse(message.slice("data: ".length));
    assert.equal(event.vendor.vendorName, "Vendor A1");
  });
});
