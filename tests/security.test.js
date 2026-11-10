const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

process.env.ROUND_ENCRYPTION = "4";

const { startTestApp, seedBase, clearDatabase, createUserToken } = require("./helpers/testApp");

const User = require("../features/user/model/userModel");
const Sales = require("../features/sale/model/salesModel");
const SalesService = require("../features/sale/service/salesService");
const activeSalesCache = require("../shared/activeSalesCache");
const MonthlyGoalService = require("../features/goals/service/monthlyGoalService");

describe("Segurança e carga", () => {
  let testApp;
  let adminToken;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({});
    adminToken = await createUserToken("admin");
  });

  const request = async (method, path, { token, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text.startsWith("{") ? JSON.parse(text) : text };
  };

  describe("limite de tentativas erradas de login", () => {
    beforeEach(async () => {
      for (const email of ["limite@teste.com", "limite2@teste.com"]) {
        await request("POST", "/users", {
          token: adminToken,
          body: { email, password: "123456", passwordConfirmation: "123456", role: "admin" },
        });
      }
    });

    const login = (email, password) => request("POST", "/auth/login", { body: { email, password } });

    it("10 senhas erradas seguidas → a 11ª tentativa é barrada (429), até com a senha certa", async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        assert.equal((await login("limite@teste.com", "errada")).status, 401);
      }
      assert.equal((await login("limite@teste.com", "errada")).status, 429);
      assert.equal((await login("limite@teste.com", "123456")).status, 429);
    });

    it("a contagem é por e-mail: outra pessoa do mesmo IP entra normalmente; login certo zera a contagem", async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) await login("outra@teste.com", "errada");
      assert.equal((await login("limite2@teste.com", "123456")).status, 200);

      for (let attempt = 0; attempt < 9; attempt += 1) await login("limite2@teste.com", "errada");
      assert.equal((await login("limite2@teste.com", "123456")).status, 200);
      for (let attempt = 0; attempt < 9; attempt += 1) await login("limite2@teste.com", "errada");
      assert.equal((await login("limite2@teste.com", "123456")).status, 200);
    });
  });

  it("cabeçalhos de segurança e sem X-Powered-By", async () => {
    const { headers } = await request("GET", "/analytics/forecast", { token: adminToken });
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-frame-options"), "DENY");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.equal(headers.get("x-powered-by"), null);
  });

  it("erro inesperado (500) não mostra detalhes internos; erro esperado mantém a mensagem", async () => {
    const silence = mock.method(console, "error", () => {});
    const failing = mock.method(MonthlyGoalService, "getProgress", async () => {
      throw new Error("detalhe interno do banco");
    });
    try {
      const internal = await request("GET", "/goals/2026-11/progress", { token: adminToken });
      assert.equal(internal.status, 500);
      assert.deepEqual(internal.body, { error: "Erro interno do servidor" });
    } finally {
      failing.mock.restore();
      silence.mock.restore();
    }

    const notFound = await request("GET", "/goals/2026-13", { token: adminToken });
    assert.equal(notFound.status, 400);
    assert.match(notFound.body.error, /Mês inválido/);
  });

  describe("cache curto das vendas ativas", () => {
    it("várias buscas ao mesmo tempo viram uma só", async () => {
      activeSalesCache.clear();
      const [a, b] = await Promise.all([SalesService.findActiveByPeriod("all"), SalesService.findActiveByPeriod("all")]);
      assert.equal(a, b);
    });

    it("venda nova, cancelada ou apagada aparece na hora (o cache é limpo a cada gravação)", async () => {
      const seed = await seedBase();
      const sale = (rdDealId, value) => ({
        rdDealId,
        vendorId: seed.vendorA1._id,
        value,
        rdUpdatedAt: new Date(),
        segment: "b2b",
        funnelType: "sales",
        realizedAt: new Date("2026-11-03T15:00:00.000Z"),
        dealStatus: "ativa",
      });

      assert.equal((await SalesService.findActiveByPeriod("all")).length, 0);
      await Sales.create(sale("c1", 100));
      assert.equal((await SalesService.findActiveByPeriod("all")).length, 1);
      await Sales.insertMany([sale("c2", 200)]);
      assert.equal((await SalesService.findActiveByPeriod("all")).length, 2);
      await Sales.updateOne({ rdDealId: "c1" }, { $set: { dealStatus: "cancelada" } });
      assert.equal((await SalesService.findActiveByPeriod("all")).length, 1);
      await Sales.deleteMany({});
      assert.equal((await SalesService.findActiveByPeriod("all")).length, 0);
    });
  });
});
