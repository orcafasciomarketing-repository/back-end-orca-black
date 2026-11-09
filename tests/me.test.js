const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.ROUND_ENCRYPTION = "4";

const { startTestApp, seedBase, clearDatabase, createUserToken, TEST_POINTS } = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const User = require("../features/user/model/userModel");
const { generateAccessToken } = require("../shared/accessTokenService");
const { personEmail, personPassword } = require("../seed");

describe("Área do colaborador (/me) e perfis vendor e sdr", () => {
  let testApp;
  let seed;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  const personToken = async (role, field, person, email) => {
    await User.collection.insertOne({ email, passwordHash: "hash-de-teste", role, [field]: person._id });
    const user = await User.findOne({ email });
    return generateAccessToken({ id: user._id, email: user.email });
  };

  const buildSale = (rdDealId, vendor, segment, funnelType, extra = {}) => ({
    rdDealId,
    vendorId: vendor._id,
    value: 1000,
    rdUpdatedAt: new Date(),
    segment,
    funnelType,
    realizedAt: new Date(),
    dealStatus: "ativa",
    ...extra,
  });

  beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({});
    seed = await seedBase();
    tokens = {
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      vendorA1: await personToken("vendor", "vendorId", seed.vendorA1, "a1@teste.com"),
      vendorB1: await personToken("vendor", "vendorId", seed.vendorB1, "b1@teste.com"),
      sdrB: await personToken("sdr", "sdrId", seed.sdrB, "sdrb@teste.com"),
    };

    await Sales.create([
      buildSale("m1", seed.vendorA1, "b2b", "sales", { sdrIds: [seed.sdrB._id] }),
      buildSale("m2", seed.vendorA1, "b2g", "farm"),
      buildSale("m3", seed.vendorA2, "b2b", "sales"),
      buildSale("m4", seed.vendorB1, "b2b", "sales", { sdrIds: [seed.sdrB._id] }),
      buildSale("m5", seed.vendorA1, "b2b", "sales", { dealStatus: "cancelada" }),
    ]);
  });

  const request = async (method, path, token, body) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  };

  const dealIds = (body) => body.data.data.map((sale) => sale.rdDealId).sort();

  describe("bloqueios", () => {
    const ADMIN_ROUTES = [
      "/sales/admin",
      "/analytics/forecast",
      "/analytics/points-history",
      "/analytics/people-points",
      "/users",
      "/logs",
    ];

    it("vendedor e passagem não acessam nenhuma rota do admin → 403", async () => {
      const vendorRoutes = [...ADMIN_ROUTES, `/sales/get/${seed.vendorB1._id}`, `/sales/get/${seed.vendorA1._id}`];
      for (const token of [tokens.vendorA1, tokens.sdrB]) {
        for (const path of vendorRoutes) {
          const { status } = await request("GET", path, token);
          assert.equal(status, 403, path);
        }
      }
    });

    it("os perfis do admin continuam acessando as rotas do admin", async () => {
      for (const path of ["/sales/admin", "/analytics/forecast", "/analytics/points-history", "/analytics/people-points"]) {
        assert.equal((await request("GET", path, tokens.admin)).status, 200, path);
        assert.equal((await request("GET", path, tokens.b2b)).status, 200, path);
      }
      assert.equal((await request("GET", `/sales/get/${seed.vendorA1._id}`, tokens.admin)).status, 200);
    });

    it("os perfis do admin não entram na área do colaborador → 403; sem login → 401", async () => {
      assert.equal((await request("GET", "/me", tokens.admin)).status, 403);
      assert.equal((await request("GET", "/me/sales", tokens.b2b)).status, 403);
      assert.equal((await request("GET", "/me", undefined)).status, 401);
    });

    it("as rotas públicas das TVs continuam abertas", async () => {
      for (const path of ["/analytics/goal", "/analytics/scoreboard", "/analytics/ranking", "/sales/get"]) {
        assert.equal((await request("GET", path, undefined)).status, 200, path);
      }
    });
  });

  describe("GET /me", () => {
    it("vendedor: nome, cargo e time", async () => {
      const { status, body } = await request("GET", "/me", tokens.vendorA1);

      assert.equal(status, 200);
      assert.equal(body.data.kind, "vendor");
      assert.equal(body.data.name, "Vendor A1");
      assert.equal(body.data.team.teamName, "Time A");
    });

    it("passagem: nome, cargo e time", async () => {
      const { body } = await request("GET", "/me", tokens.sdrB);

      assert.equal(body.data.kind, "sdr");
      assert.equal(body.data.name, "SDR B");
      assert.equal(body.data.job, "B2B SDR");
      assert.equal(body.data.team.teamName, "Time B");
    });

    it("pessoa apagada do cadastro → 404", async () => {
      const Vendors = require("../features/vendors/model/vendorsModel");
      await Vendors.deleteOne({ _id: seed.vendorB1._id });

      assert.equal((await request("GET", "/me", tokens.vendorB1)).status, 404);
    });
  });

  describe("GET /me/sales", () => {
    it("vendedor recebe só as vendas dele (inclusive canceladas), nunca as dos outros", async () => {
      const { status, body } = await request("GET", "/me/sales", tokens.vendorA1);

      assert.equal(status, 200);
      assert.deepEqual(dealIds(body), ["m1", "m2", "m5"]);
      assert.equal(body.data.total, 3);
    });

    it("passagem recebe as vendas em que participou da passagem", async () => {
      const { body } = await request("GET", "/me/sales", tokens.sdrB);

      assert.deepEqual(dealIds(body), ["m1", "m4"]);
    });

    it("não dá para pedir as vendas de outra pessoa pela URL", async () => {
      const { body } = await request("GET", `/me/sales?vendorId=${seed.vendorB1._id}`, tokens.vendorA1);

      assert.deepEqual(dealIds(body), ["m1", "m2", "m5"]);
    });
  });

  describe("GET /me/team", () => {
    it("posição do time entre todos e os pontos de cada colega, sem valores de venda", async () => {
      const { status, body } = await request("GET", "/me/team", tokens.vendorA1);
      const { data } = body;

      assert.equal(status, 200);
      assert.equal(data.period, "all");
      assert.equal(data.teams.length, 3);
      assert.deepEqual(
        data.teams.map((team) => team.position),
        [1, 2, 3],
      );
      assert.equal(data.team.teamName, "Time A");
      assert.equal(data.team.total, TEST_POINTS.b2bSale * 2 + TEST_POINTS.b2gFarm);
      assert.deepEqual(data.people.map((person) => person.name).sort(), ["Vendor A1", "Vendor A2"]);

      const me = data.people.find((person) => person.isMe);
      assert.equal(me.name, "Vendor A1");
      assert.equal(me.total, TEST_POINTS.b2bSale + TEST_POINTS.b2gFarm);
      assert.equal(JSON.stringify(data).includes('"value"'), false);
    });

    it("a soma dos pontos do time bate com o placar das TVs", async () => {
      const [{ body }, scoreboard] = await Promise.all([
        request("GET", "/me/team", tokens.sdrB),
        request("GET", "/analytics/scoreboard", undefined),
      ]);
      const teamB = scoreboard.body.data.find((team) => team.teamName === "Time B");

      assert.equal(body.data.team.total, teamB.total);
      assert.equal(
        body.data.people.reduce((sum, person) => sum + person.total, 0),
        teamB.total,
      );
      assert.equal(body.data.people.find((person) => person.isMe).name, "SDR B");
    });

    it("aceita ?period=week e lastWeek; outro valor vira all", async () => {
      assert.equal((await request("GET", "/me/team?period=week", tokens.vendorA1)).body.data.period, "week");
      assert.equal((await request("GET", "/me/team?period=lastWeek", tokens.vendorA1)).body.data.period, "lastWeek");
      assert.equal((await request("GET", "/me/team?period=x", tokens.vendorA1)).body.data.period, "all");
      assert.equal((await request("GET", "/me/team?period=lastWeek", tokens.vendorA1)).body.data.team.total, 0);
    });
  });

  describe("cadastro de contas de colaborador (/users)", () => {
    const newUser = (overrides = {}) => ({
      email: "pessoa@teste.com",
      password: "123456",
      passwordConfirmation: "123456",
      role: "vendor",
      ...overrides,
    });

    it("perfil vendor sem a pessoa → 400", async () => {
      const res = await request("POST", "/users", tokens.admin, newUser());
      assert.equal(res.status, 400);
    });

    it("perfil vendor com a pessoa → 201, e o login devolve o vendorId", async () => {
      const created = await request("POST", "/users", tokens.admin, newUser({ vendorId: String(seed.vendorC1._id) }));
      const login = await request("POST", "/auth/login", undefined, { email: "pessoa@teste.com", password: "123456" });

      assert.equal(created.status, 201);
      assert.equal(created.body.data.vendorId, String(seed.vendorC1._id));
      assert.equal(login.status, 200);
      assert.equal(login.body.user.role, "vendor");
      assert.equal(login.body.user.vendorId, String(seed.vendorC1._id));
    });

    it("perfil sdr com a pessoa → 201", async () => {
      const created = await request(
        "POST",
        "/users",
        tokens.admin,
        newUser({ role: "sdr", sdrId: String(seed.csB._id) }),
      );

      assert.equal(created.status, 201);
      assert.equal(created.body.data.sdrId, String(seed.csB._id));
    });

    it("pessoa que não existe → 400; pessoa que já tem conta → 409", async () => {
      const missing = await request("POST", "/users", tokens.admin, newUser({ vendorId: "0123456789abcdef01234567" }));
      const duplicated = await request("POST", "/users", tokens.admin, newUser({ vendorId: String(seed.vendorA1._id) }));

      assert.equal(missing.status, 400);
      assert.equal(duplicated.status, 409);
    });

    it("trocar o perfil de colaborador para admin tira a ligação com a pessoa", async () => {
      const created = await request("POST", "/users", tokens.admin, newUser({ vendorId: String(seed.vendorC1._id) }));
      const updated = await request("PATCH", `/users/${created.body.data._id}`, tokens.admin, { role: "b2b" });

      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.role, "b2b");
      assert.equal(updated.body.data.vendorId, undefined);
    });

    it("cadastro de admin, b2b e b2g continua igual (sem pessoa)", async () => {
      const created = await request("POST", "/users", tokens.admin, newUser({ role: "b2b" }));

      assert.equal(created.status, 201);
      assert.equal(created.body.data.vendorId, undefined);
      assert.equal(created.body.data.sdrId, undefined);
    });
  });

  describe("seed das contas", () => {
    it("e-mail nome.sobrenome@orcafascio.com, sem acento", () => {
      assert.equal(personEmail("Joice Pereira"), "joice.pereira@orcafascio.com");
      assert.equal(personEmail("Brenda Florêncio"), "brenda.florencio@orcafascio.com");
      assert.equal(personEmail("Vinícius Pereira"), "vinicius.pereira@orcafascio.com");
      assert.equal(personEmail("Jonathan"), "jonathan@orcafascio.com");
    });

    it("senha: primeiro nome com a primeira letra maiúscula + 123", () => {
      assert.equal(personPassword("Joice Pereira"), "Joice123");
      assert.equal(personPassword("Vinícius Pereira"), "Vinicius123");
      assert.equal(personPassword("Jonathan"), "Jonathan123");
    });
  });
});
