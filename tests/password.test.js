const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.ROUND_ENCRYPTION = "4";

const { startTestApp, createUserToken } = require("./helpers/testApp");

const User = require("../features/user/model/userModel");
const Token = require("../features/token/model/tokenModel");

describe("Sair (/auth/logout) e trocar a própria senha (/auth/change-password)", () => {
  let testApp;
  let adminToken;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  const request = async (method, path, { token, cookie, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const setCookie = res.headers.get("set-cookie") ?? "";
    return {
      status: res.status,
      body: text.startsWith("{") ? JSON.parse(text) : text,
      setCookie,
      cookie: setCookie.split(";")[0],
    };
  };

  const login = (password = "123456") =>
    request("POST", "/auth/login", { body: { email: "pessoa@teste.com", password } });

  beforeEach(async () => {
    await User.deleteMany({});
    await Token.deleteMany({});
    adminToken = await createUserToken("admin");
    const created = await request("POST", "/users", {
      token: adminToken,
      body: { email: "pessoa@teste.com", password: "123456", passwordConfirmation: "123456", role: "b2b" },
    });
    assert.equal(created.status, 201);
  });

  describe("POST /auth/logout", () => {
    it("invalida o refresh token do cookie e apaga o cookie: o refresh depois falha", async () => {
      const { cookie } = await login();

      const logout = await request("POST", "/auth/logout", { cookie });
      const refresh = await request("POST", "/auth/refresh", { cookie });

      assert.equal(logout.status, 200);
      assert.match(logout.setCookie, /refreshToken=;/);
      assert.equal(refresh.status, 401);
    });

    it("sem cookie ou com cookie que já não vale também responde 200", async () => {
      assert.equal((await request("POST", "/auth/logout")).status, 200);
      assert.equal((await request("POST", "/auth/logout", { cookie: "refreshToken=qualquer" })).status, 200);
    });

    it("sair de uma sessão não derruba a outra (outro navegador)", async () => {
      const first = await login();
      const second = await request("POST", "/auth/login", { body: { email: "pessoa@teste.com", password: "123456" } });
      await Token.updateMany({}, { $set: { revokedAt: null } });

      await request("POST", "/auth/logout", { cookie: first.cookie });

      assert.equal((await request("POST", "/auth/refresh", { cookie: second.cookie })).status, 200);
    });
  });

  describe("POST /auth/change-password", () => {
    const change = (token, body) => request("POST", "/auth/change-password", { token, body });

    it("sem login → 401", async () => {
      const res = await change(undefined, { currentPassword: "123456", password: "nova123", passwordConfirmation: "nova123" });
      assert.equal(res.status, 401);
    });

    it("troca a própria senha: a nova entra, a antiga não, as outras sessões caem e a pessoa continua logada", async () => {
      const old = await login();

      const res = await change(old.body.token, {
        currentPassword: "123456",
        password: "nova123",
        passwordConfirmation: "nova123",
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, "pessoa@teste.com");
      assert.ok(res.body.token);
      assert.equal((await request("POST", "/auth/refresh", { cookie: old.cookie })).status, 401);
      assert.equal((await request("POST", "/auth/refresh", { cookie: res.cookie })).status, 200);
      assert.equal((await login("123456")).status, 401);
      assert.equal((await login("nova123")).status, 200);
    });

    it("senha atual errada → 400 e nada muda", async () => {
      const { body } = await login();

      const res = await change(body.token, { currentPassword: "errada", password: "nova123", passwordConfirmation: "nova123" });

      assert.equal(res.status, 400);
      assert.equal((await login("123456")).status, 200);
    });

    it("senha nova curta ou confirmação diferente → 400", async () => {
      const { body } = await login();

      const short = await change(body.token, { currentPassword: "123456", password: "123", passwordConfirmation: "123" });
      const different = await change(body.token, {
        currentPassword: "123456",
        password: "nova123",
        passwordConfirmation: "outra123",
      });

      assert.equal(short.status, 400);
      assert.equal(different.status, 400);
      assert.equal((await login("123456")).status, 200);
    });

    it("não dá para trocar a senha de outra pessoa (campos extras são recusados)", async () => {
      const { body } = await login();
      const admin = await User.findOne({ email: "admin@teste.com" });

      const res = await change(body.token, {
        currentPassword: "123456",
        password: "nova123",
        passwordConfirmation: "nova123",
        userId: String(admin._id),
      });

      assert.equal(res.status, 400);
    });

    it("vale para os outros perfis também (admin)", async () => {
      await User.updateOne({ email: "pessoa@teste.com" }, { $set: { role: "admin" } });
      const { body } = await login();

      const res = await change(body.token, { currentPassword: "123456", password: "nova123", passwordConfirmation: "nova123" });

      assert.equal(res.status, 200);
    });
  });
});
