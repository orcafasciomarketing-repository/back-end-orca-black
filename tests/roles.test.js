const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Hash rápido só nos testes (o padrão de 15 rodadas deixaria cada cadastro lento).
// Precisa vir antes dos requires do projeto: o passwordService lê ao carregar
process.env.ROUND_ENCRYPTION = "4";

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

describe("Perfis de acesso (admin, b2b, b2g)", () => {
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

  describe("telas só do admin (importação, erros e usuários)", () => {
    const adminOnly = [
      ["POST", "/sales/import/preview", CSV],
      ["POST", "/sales/import", CSV],
      ["GET", "/logs"],
      ["GET", "/users"],
      ["POST", "/users", { email: "novo@teste.com", password: "123456", passwordConfirmation: "123456", role: "b2b" }],
    ];

    for (const [method, path, body] of adminOnly) {
      for (const role of ["b2b", "b2g"]) {
        it(`${method} ${path} com ${role} → 403`, async () => {
          const res = await request(method, path, tokens[role], body);

          assert.equal(res.status, 403);
          assert.equal(res.body.error, "Sem permissão para acessar");
        });
      }

      for (const role of ["admin", "antigo"]) {
        it(`${method} ${path} com ${role} → liberado`, async () => {
          const res = await request(method, path, tokens[role], body);

          assert.ok([200, 201].includes(res.status), `status ${res.status}`);
        });
      }
    }

    it("importação recusada para b2b não grava nada", async () => {
      await request("POST", "/sales/import", tokens.b2b, CSV);

      assert.equal(await Sales.countDocuments({ source: "importacao" }), 0);
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

    it("lista os usuários com o perfil, sem a senha (antigo aparece como admin)", async () => {
      const { status, body } = await request("GET", "/users", tokens.admin);
      const roleByEmail = Object.fromEntries(body.data.map((user) => [user.email, user.role]));

      assert.equal(status, 200);
      assert.deepEqual(roleByEmail, {
        "admin@teste.com": "admin",
        "antigo@teste.com": "admin",
        "b2b@teste.com": "b2b",
        "b2g@teste.com": "b2g",
      });
      assert.ok(body.data.every((user) => user.passwordHash === undefined));
    });

    it("troca o perfil de outro usuário", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const res = await request("PATCH", `/users/${user._id}`, tokens.admin, { role: "admin" });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.role, "admin");
      assert.equal((await User.findById(user._id)).role, "admin");
    });

    it("troca a senha: a nova funciona, a antiga não, e as sessões abertas caem", async () => {
      await request("POST", "/users", tokens.admin, newUser());
      const login = await request("POST", "/auth/login", undefined, { email: "nova@teste.com", password: "123456" });
      const user = await User.findOne({ email: "nova@teste.com" });

      const res = await request("PATCH", `/users/${user._id}`, tokens.admin, {
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

      const res = await request("PATCH", `/users/${user._id}`, tokens.admin, {});

      assert.equal(res.status, 400);
    });

    it("admin não troca o próprio perfil nem se exclui (nunca fica sem admin)", async () => {
      const me = await User.findOne({ email: "admin@teste.com" });

      const patch = await request("PATCH", `/users/${me._id}`, tokens.admin, { role: "b2b" });
      const remove = await request("DELETE", `/users/${me._id}`, tokens.admin);

      assert.equal(patch.status, 400);
      assert.equal(remove.status, 400);
      assert.equal((await User.findById(me._id)).role, "admin");
    });

    it("exclui outro usuário: ele perde o acesso na hora", async () => {
      const user = await User.findOne({ email: "b2b@teste.com" });

      const res = await request("DELETE", `/users/${user._id}`, tokens.admin);
      const afterDelete = await request("GET", "/sales/admin", tokens.b2b);

      assert.equal(res.status, 200);
      assert.equal(await User.countDocuments({ _id: user._id }), 0);
      assert.equal(afterDelete.status, 401);
    });

    for (const id of ["6650f0f0f0f0f0f0f0f0f0f0", "nao-e-um-id"]) {
      it(`usuário ${id} que não existe → 404`, async () => {
        const patch = await request("PATCH", `/users/${id}`, tokens.admin, { role: "b2b" });
        const remove = await request("DELETE", `/users/${id}`, tokens.admin);

        assert.equal(patch.status, 404);
        assert.equal(remove.status, 404);
      });
    }
  });
});
