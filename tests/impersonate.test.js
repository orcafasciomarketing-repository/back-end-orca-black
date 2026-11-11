const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.MASTER_EMAIL = "master@teste.com";

const { startTestApp, seedBase, clearDatabase, createUserToken } = require("./helpers/testApp");

const User = require("../features/user/model/userModel");

describe("Acessar como (POST /auth/impersonate/:id)", () => {
  let testApp;
  let seed;
  let tokens;
  let ids;

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
      master: await createUserToken("admin", "master@teste.com"),
      admin: await createUserToken("admin"),
      b2b: await createUserToken("b2b"),
    };
    await User.collection.insertOne({ email: "a1@teste.com", passwordHash: "x", role: "vendor", vendorId: seed.vendorA1._id });
    await User.collection.insertOne({ email: "sdr@teste.com", passwordHash: "x", role: "sdr", sdrId: seed.sdrB._id });
    ids = {
      vendor: String((await User.findOne({ email: "a1@teste.com" }))._id),
      sdr: String((await User.findOne({ email: "sdr@teste.com" }))._id),
      b2b: String((await User.findOne({ email: "b2b@teste.com" }))._id),
    };
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
    return {
      status: res.status,
      body: text.startsWith("{") ? JSON.parse(text) : text,
      setCookie: res.headers.get("set-cookie"),
    };
  };

  const impersonate = (id, token = tokens.master) => request("POST", `/auth/impersonate/${id}`, token);

  it("o master entra na área do vendedor e vê o que ele vê, sem mexer no cookie da própria sessão", async () => {
    const res = await impersonate(ids.vendor);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, "a1@teste.com");
    assert.equal(res.body.user.role, "vendor");
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.setCookie, null);

    const me = await request("GET", "/me", res.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.name, "Vendor A1");
    assert.equal((await request("GET", "/me/goals", res.body.token)).status, 200);
    assert.equal((await request("GET", "/admin-nao-existe", res.body.token)).status, 404);
    assert.equal((await request("GET", "/users", res.body.token)).status, 403);
  });

  it("também como pessoa de passagem; não como admin, b2b ou b2g", async () => {
    const sdr = await impersonate(ids.sdr);
    assert.equal(sdr.status, 200);
    assert.equal((await request("GET", "/me", sdr.body.token)).body.data.name, "SDR B");

    const b2b = await impersonate(ids.b2b);
    assert.equal(b2b.status, 400);
    assert.match(b2b.body.error, /Só dá para acessar como vendedor ou passagem/);
    assert.equal((await impersonate("000000000000000000000000")).status, 404);
    assert.equal((await impersonate("xyz")).status, 404);
  });

  it("só o master: admin e b2b → 403; sem login → 401", async () => {
    assert.equal((await impersonate(ids.vendor, tokens.admin)).status, 403);
    assert.equal((await impersonate(ids.vendor, tokens.b2b)).status, 403);
    assert.equal((await request("POST", `/auth/impersonate/${ids.vendor}`)).status, 401);
  });

  it("é só para ver: nada que grava passa, nem trocar a senha da pessoa nem acessar como outra", async () => {
    const { token } = (await impersonate(ids.vendor)).body;

    const password = await request("POST", "/auth/change-password", token, {
      currentPassword: "qualquer",
      password: "nova123",
      passwordConfirmation: "nova123",
    });
    assert.equal(password.status, 403);
    assert.match(password.body.error, /dá só para ver/);
    assert.equal((await impersonate(ids.sdr, token)).status, 403);
  });

  it("se quem abriu deixa de ser master (ou é excluído), o acesso cai na hora", async () => {
    const { token } = (await impersonate(ids.vendor)).body;
    assert.equal((await request("GET", "/me", token)).status, 200);

    await User.deleteOne({ email: "master@teste.com" });
    const res = await request("GET", "/me", token);
    assert.equal(res.status, 401);
    assert.match(res.body.error, /encerrado/);
  });

  it("o token normal do vendedor continua igual (sem o modo só leitura)", async () => {
    const { generateAccessToken } = require("../shared/accessTokenService");
    const user = await User.findOne({ email: "a1@teste.com" });
    const own = generateAccessToken({ id: user._id, email: user.email });
    assert.equal((await request("GET", "/me", own)).status, 200);
    const password = await request("POST", "/auth/change-password", own, {
      currentPassword: "errada1",
      password: "nova123",
      passwordConfirmation: "nova123",
    });
    assert.notEqual(password.status, 403);
  });
});
