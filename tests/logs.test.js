const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { startTestApp } = require("./helpers/testApp");

const Logs = require("../features/logs/model/logsModel");
const { generateAccessToken } = require("../shared/accessTokenService");

// Log no formato que o front envia (ERROS_E_LOGS.md, item 4)
const buildLog = (overrides = {}) => ({
  level: "error",
  message: "Request failed with status code 500",
  stack: "AxiosError: Request failed...\n    at getScoreboard (dashboardApi.js:27)",
  componentStack: "at TeamPodium\n    at Suspense",
  location: 'Dashboard › tela "team-ranking-week"',
  url: "http://192.168.1.50:5173/",
  userAgent: "Mozilla/5.0",
  occurredAt: "2026-10-22T15:00:00.000Z",
  ...overrides,
});

describe("Logs de erro do front (/logs)", () => {
  let testApp;

  before(async () => {
    testApp = await startTestApp();
    await Logs.init();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await Logs.deleteMany({});
  });

  const postLog = async (body) =>
    await fetch(`${testApp.baseUrl}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const getLogs = async (headers = {}) => await fetch(`${testApp.baseUrl}/logs`, { headers });

  const adminHeaders = () => ({
    Authorization: `Bearer ${generateAccessToken({ id: "admin-teste", email: "admin@teste.com" })}`,
  });

  describe("POST /logs (pública)", () => {
    it("sem token → 201 e o log é salvo com os campos do front", async () => {
      const res = await postLog(buildLog());
      const saved = await Logs.findOne().lean();

      assert.equal(res.status, 201);
      assert.equal(saved.message, "Request failed with status code 500");
      assert.equal(saved.location, 'Dashboard › tela "team-ranking-week"');
      assert.equal(saved.url, "http://192.168.1.50:5173/");
      assert.equal(saved.occurredAt.toISOString(), "2026-10-22T15:00:00.000Z");
    });

    it("guarda o horário de recebimento (createdAt) além do occurredAt da TV", async () => {
      await postLog(buildLog({ occurredAt: "2020-01-01T00:00:00.000Z" }));
      const saved = await Logs.findOne().lean();

      assert.ok(saved.createdAt > saved.occurredAt);
    });

    it("stack e componentStack null são aceitos (não viram o texto \"null\")", async () => {
      const res = await postLog(buildLog({ stack: null, componentStack: null }));
      const saved = await Logs.findOne().lean();

      assert.equal(res.status, 201);
      assert.equal(saved.stack, null);
      assert.equal(saved.componentStack, null);
    });

    it("stack muito longo é cortado em vez de recusar o log", async () => {
      const res = await postLog(buildLog({ stack: "x".repeat(50000) }));
      const saved = await Logs.findOne().lean();

      assert.equal(res.status, 201);
      assert.equal(saved.stack.length, 20000);
    });

    it("campo extra que o front venha a mandar é ignorado (não recusa o log)", async () => {
      const res = await postLog(buildLog({ campoNovo: "qualquer coisa" }));
      const saved = await Logs.findOne().lean();

      assert.equal(res.status, 201);
      assert.equal("campoNovo" in saved, false);
    });

    it("sem message → 400", async () => {
      const { message, ...logWithoutMessage } = buildLog();

      const res = await postLog(logWithoutMessage);

      assert.equal(res.status, 400);
      assert.equal(await Logs.countDocuments(), 0);
    });

    it("logs são apagados sozinhos depois de 30 dias (índice TTL)", async () => {
      const indexes = await Logs.collection.indexes();
      const ttlIndex = indexes.find((index) => index.key.createdAt === 1);

      assert.equal(ttlIndex.expireAfterSeconds, 30 * 24 * 60 * 60);
    });
  });

  describe("GET /logs (privada)", () => {
    it("sem token → 401", async () => {
      const res = await getLogs();

      assert.equal(res.status, 401);
    });

    it("com token → envelope padrão, do mais novo para o mais antigo, cada log com _id", async () => {
      await postLog(buildLog({ message: "primeiro" }));
      await postLog(buildLog({ message: "segundo" }));
      await postLog(buildLog({ message: "terceiro" }));

      const res = await getLogs(adminHeaders());
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.success, true);
      assert.deepEqual(
        body.data.map((log) => log.message),
        ["terceiro", "segundo", "primeiro"],
      );
      for (const log of body.data) assert.ok(log._id);
    });

    it("sem logs → lista vazia", async () => {
      const res = await getLogs(adminHeaders());
      const body = await res.json();

      assert.deepEqual(body.data, []);
    });
  });
});
