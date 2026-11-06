const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Hash rápido só nos testes (o padrão de 15 rodadas deixaria cada cadastro lento).
// Precisa vir antes dos requires do projeto: o passwordService e o config/roles leem ao carregar
process.env.ROUND_ENCRYPTION = "4";
process.env.MASTER_EMAIL = "Master@Teste.com";

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildSheetRow,
  sendSheet,
  createUserToken,
} = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const User = require("../features/user/model/userModel");
const Token = require("../features/token/model/tokenModel");
const { generateAccessToken } = require("../shared/accessTokenService");

describe("Perfis de acesso (master, admin, b2b, b2g)", () => {
  let testApp;
  let seed;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({});
    seed = await seedBase();
    tokens = {
      // O master é um admin com o e-mail do MASTER_EMAIL (sem diferença de maiúscula)
      master: await createUserToken("admin", "master@teste.com"),
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
      b2g: await createUserToken("b2g"),
      // Usuário cadastrado antes de existir o perfil (sem o campo role)
      antigo: await createUserToken(undefined),
    };

    // Uma venda de cada setor, do mesmo vendedor
    await sendSheet(testApp.baseUrl, [
      buildSheetRow({ id: "venda-b2b", sector: "B2B" }),
      buildSheetRow({ id: "venda-b2g", sector: "B2G" }),
    ]);
  });

  const request = async (method, path, token, body) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = typeof body === "string" ? "text/csv" : "application/json";
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    // Rota que não existe responde HTML (404 padrão do Express)
    const text = await res.text();
    return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  };

  const saleIds = (body) => body.data.data.map((sale) => sale.rdDealId).sort();

  const CSV = "Setor,Valor da venda,Data da venda\nB2B,1000,27/11/2026";

  describe("vendas do admin (GET /sales/admin e /sales/get/:vendorId)", () => {
    const cases = [
      ["master", ["venda-b2b", "venda-b2g"]],
      ["admin", ["venda-b2b", "venda-b2g"]],
      ["antigo", ["venda-b2b", "venda-b2g"]],
      ["b2b", ["venda-b2b"]],
      ["b2g", ["venda-b2g"]],
    ];

    for (const [role, expected] of cases) {
      it(`${role} → ${expected.join(" e ")}`, async () => {
        const all = await request("GET", "/sales/admin", tokens[role]);
        const byVendor = await request("GET", `/sales/get/${seed.vendorA1._id}`, tokens[role]);

        assert.equal(all.status, 200);
        assert.deepEqual(saleIds(all.body), expected);
        assert.equal(all.body.data.total, expected.length);
        assert.equal(byVendor.status, 200);
        assert.deepEqual(saleIds(byVendor.body), expected);
        assert.equal(byVendor.body.data.total, expected.length);
      });
    }

    it("b2b com paginação: o total também é só do setor", async () => {
      const { body } = await request("GET", "/sales/admin?page=1&limit=10", tokens.b2b);

      assert.deepEqual(saleIds(body), ["venda-b2b"]);
      assert.equal(body.data.total, 1);
    });
  });

  describe("o que cada perfil acessa (importação, erros e usuários)", () => {
    const NEW_USER = { email: "novo@teste.com", password: "123456", passwordConfirmation: "123456", role: "b2b" };
    const otherUserId = async () => (await User.findOne({ email: "b2g@teste.com" }))._id;

    // [método, rota, body, perfis liberados]
    const routes = [
      ["POST", "/sales/import/preview", () => CSV, ["master"]],
      ["POST", "/sales/import", () => CSV, ["master"]],
      ["GET", "/logs", () => undefined, ["master"]],
      ["GET", "/users", () => undefined, ["master", "admin", "antigo"]],
      ["POST", "/users", () => NEW_USER, ["master", "admin", "antigo"]],
      ["PATCH", "/users/:id", () => ({ role: "b2b" }), ["master"]],
      ["DELETE", "/users/:id", () => undefined, ["master"]],
    ];

    for (const [method, path, body, allowed] of routes) {
      for (const role of ["master", "admin", "antigo", "b2b", "b2g"]) {
        const isAllowed = allowed.includes(role);

        it(`${method} ${path} com ${role} → ${isAllowed ? "liberado" : "403"}`, async () => {
          const url = path.replace(":id", await otherUserId());
          const res = await request(method, url, tokens[role], body());

          if (isAllowed) {
            assert.ok([200, 201].includes(res.status), `status ${res.status}`);
          } else {
            assert.equal(res.status, 403);
            assert.equal(res.body.error, "Sem permissão para acessar");
          }
        });
      }
    }

    it("importação recusada para admin e b2b não grava nada", async () => {
      await request("POST", "/sales/import", tokens.admin, CSV);
      await request("POST", "/sales/import", tokens.b2b, CSV);

      assert.equal(await Sales.countDocuments({ source: "importacao" }), 0);
    });

    it("admin recusado não troca o perfil nem exclui ninguém", async () => {
      const id = await otherUserId();

      await request("PATCH", `/users/${id}`, tokens.admin, { role: "admin" });
      await request("DELETE", `/users/${id}`, tokens.admin);

      assert.equal((await User.findById(id)).role, "b2g");
    });
  });

  describe("conferência do usuário no banco", () => {
    it("usuário excluído: o token que ainda não expirou deixa de valer na hora", async () => {
      await User.deleteOne({ email: "b2b@teste.com" });

      const res = await request("GET", "/sales/admin", tokens.b2b);

      assert.equal(res.status, 401);
    });

    it("troca de perfil vale na hora, com o mesmo token", async () => {
      await User.updateOne({ email: "b2b@teste.com" }, { role: "b2g" });

      const res = await request("GET", "/sales/admin", tokens.b2b);

      assert.deepEqual(saleIds(res.body), ["venda-b2g"]);
    });

    it("token com id que não é de usuário → 401", async () => {
      const token = generateAccessToken({ id: "nao-e-um-id", email: "x@teste.com" });

      const res = await request("GET", "/sales/admin", token);

      assert.equal(res.status, 401);
    });
  });

  describe("telas das TVs continuam públicas", () => {
    for (const path of ["/sales/get", "/analytics/goal", "/analytics/scoreboard", "/analytics/ranking", "/analytics/sdr-ranking"]) {
      it(`GET ${path} sem token → 200 com os dois setores`, async () => {
        const res = await request("GET", path);

        assert.equal(res.status, 200);
      });
    }

    it("a meta da TV soma os dois setores", async () => {
      const { body } = await request("GET", "/analytics/goal");

      assert.equal(body.data.total, 2000);
      assert.equal(body.data.segments.b2b.total, 1000);
      assert.equal(body.data.segments.b2g.total, 1000);
    });
  });

  describe("cadastro de usuários (/users, só admin)", () => {
    const newUser = (overrides = {}) => ({
      email: "Nova@Teste.com",
      password: "123456",
      passwordConfirmation: "123456",
      role: "b2g",
      ...overrides,
    });

    it("/auth/register não existe mais (cadastro aberto fechado) → 404", async () => {
      const res = await request("POST", "/auth/register", undefined, {
        email: "x@teste.com",
        password: "123456",
        passwordConfirmation: "123456",
      });

      assert.equal(res.status, 404);
      assert.equal(await User.countDocuments({ email: "x@teste.com" }), 0);
    });

    it("admin cadastra → 201 sem a senha na resposta, e a pessoa entra com o perfil", async () => {
      const created = await request("POST", "/users", tokens.admin, newUser());
      const login = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "123456" });

      assert.equal(created.status, 201);
      assert.equal(created.body.data.email, "nova@teste.com");
      assert.equal(created.body.data.role, "b2g");
      assert.equal(created.body.data.passwordHash, undefined);
      assert.equal(login.status, 200);
      assert.equal(login.body.user.role, "b2g");
    });

    it("login do master devolve role master (o perfil gravado continua admin)", async () => {
      await request("POST", "/users", tokens.master, newUser({ role: "admin" }));
      await User.deleteOne({ email: "master@teste.com" });
      await User.updateOne({ email: "nova@teste.com" }, { email: "master@teste.com" });

      const login = await request("POST", "/auth/login", undefined, { email: "master@teste.com", password: "123456" });

      assert.equal(login.status, 200);
      assert.equal(login.body.user.role, "master");
      assert.equal((await User.findOne({ email: "master@teste.com" })).role, "admin");
    });

    it("admin não cadastra o e-mail do master (viraria master) → 400", async () => {
      await User.deleteOne({ email: "master@teste.com" });

      const res = await request("POST", "/users", tokens.admin, newUser({ email: "master@teste.com", role: "admin" }));

      assert.equal(res.status, 400);
      assert.equal(res.body.error, "Este e-mail é reservado");
      assert.equal(await User.countDocuments({ email: "master@teste.com" }), 0);
    });

    it("login de usuário antigo (sem perfil) devolve role admin", async () => {
      await request("POST", "/users", tokens.admin, newUser({ role: "admin" }));
      await User.collection.updateOne({ email: "nova@teste.com" }, { $unset: { role: "" } });

      const login = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "123456" });

      assert.equal(login.body.user.role, "admin");
    });

    const invalidUsers = [
      ["sem perfil", { role: undefined }],
      ["perfil que não existe", { role: "gerente" }],
      ["senhas diferentes", { passwordConfirmation: "654321" }],
      ["senha curta", { password: "123", passwordConfirmation: "123" }],
      ["email inválido", { email: "nao-e-email" }],
    ];

    for (const [label, overrides] of invalidUsers) {
      it(`${label} → 400 e não cadastra`, async () => {
        const res = await request("POST", "/users", tokens.admin, newUser(overrides));

        assert.equal(res.status, 400);
        assert.equal(await User.countDocuments({ email: "nova@teste.com" }), 0);
      });
    }

    it("email já cadastrado → 409", async () => {
      const res = await request("POST", "/users", tokens.admin, newUser({ email: "b2b@teste.com" }));

      assert.equal(res.status, 409);
    });

    it("lista os usuários com o perfil, sem a senha (antigo aparece como admin, master como master)", async () => {
      const { status, body } = await request("GET", "/users", tokens.admin);
      const roleByEmail = Object.fromEntries(body.data.map((user) => [user.email, user.role]));

      assert.equal(status, 200);
      assert.deepEqual(roleByEmail, {
        "master@teste.com": "master",
        "admin@teste.com": "admin",
        "antigo@teste.com": "admin",
        "b2b@teste.com": "b2b",
        "b2g@teste.com": "b2g",
      });
      assert.ok(body.data.every((user) => user.passwordHash === undefined));
    });

    it("troca o perfil de outro usuário", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const res = await request("PATCH", `/users/${user._id}`, tokens.master, { role: "admin" });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.role, "admin");
      assert.equal((await User.findById(user._id)).role, "admin");
      assert.equal(res.body.data.passwordHash, undefined);
    });

    it("troca a senha: a nova funciona, a antiga não, e as sessões abertas caem", async () => {
      await request("POST", "/users", tokens.admin, newUser());
      const login = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "123456" });
      const user = await User.findOne({ email: "nova@teste.com" });

      const res = await request("PATCH", `/users/${user._id}`, tokens.master, {
        password: "nova-senha",
        passwordConfirmation: "nova-senha",
      });
      const oldPassword = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "123456" });
      const activeTokens = await Token.countDocuments({ userId: user._id, revokedAt: null });
      const newPassword = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "nova-senha" });

      assert.equal(login.status, 200);
      assert.equal(res.status, 200);
      assert.equal(oldPassword.status, 401);
      assert.equal(activeTokens, 0);
      assert.equal(newPassword.status, 200);
    });

    it("PATCH sem perfil e sem senha → 400", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const res = await request("PATCH", `/users/${user._id}`, tokens.master, {});

      assert.equal(res.status, 400);
    });

    it("master não troca o próprio perfil nem se exclui, mas troca a própria senha", async () => {
      const me = await User.findOne({ email: "master@teste.com" });

      const patch = await request("PATCH", `/users/${me._id}`, tokens.master, { role: "b2b" });
      const remove = await request("DELETE", `/users/${me._id}`, tokens.master);
      const password = await request("PATCH", `/users/${me._id}`, tokens.master, {
        password: "outra-senha",
        passwordConfirmation: "outra-senha",
      });

      assert.equal(patch.status, 400);
      assert.equal(remove.status, 400);
      assert.equal(password.status, 200);
      assert.equal(password.body.data.role, "master");
      assert.equal(await User.countDocuments({ _id: me._id }), 1);
    });

    it("ninguém vira master pela rota (perfil master não existe no cadastro)", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const patch = await request("PATCH", `/users/${user._id}`, tokens.master, { role: "master" });
      const create = await request("POST", "/users", tokens.master, newUser({ role: "master" }));

      assert.equal(patch.status, 400);
      assert.equal(create.status, 400);
    });

    it("exclui outro usuário: ele perde o acesso na hora", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const res = await request("DELETE", `/users/${user._id}`, tokens.master);
      const afterDelete = await request("GET", "/sales/admin", tokens.b2b);

      assert.equal(res.status, 200);
      assert.equal(await User.countDocuments({ _id: user._id }), 0);
      assert.equal(afterDelete.status, 401);
    });

    for (const id of ["6650f0f0f0f0f0f0f0f0f0f0", "nao-e-um-id"]) {
      it(`usuário ${id} que não existe → 404`, async () => {
        const patch = await request("PATCH", `/users/${id}`, tokens.master, { role: "b2b" });
        const remove = await request("DELETE", `/users/${id}`, tokens.master);

        assert.equal(patch.status, 404);
        assert.equal(remove.status, 404);
      });
    }
  });
});
