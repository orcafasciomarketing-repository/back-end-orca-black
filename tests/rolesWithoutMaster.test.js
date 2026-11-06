const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Sem MASTER_EMAIL (ex.: deploy antes de criar a variável no Render): todo admin
// continua fazendo tudo, como antes dos perfis. Precisa vir antes dos requires
process.env.MASTER_EMAIL = "";

const { startTestApp, clearDatabase, createUserToken } = require("./helpers/testApp");
const User = require("../features/user/model/userModel");

describe("Perfis sem MASTER_EMAIL configurado", () => {
  let testApp;
  let tokens;

  before(async () => {
    testApp = await startTestApp();
    await clearDatabase();
    await User.deleteMany({});
    tokens = {
      admin: await createUserToken("admin"),
      antigo: await createUserToken(undefined),
      b2b: await createUserToken("b2b"),
    };
  });

  after(async () => {
    await testApp.stop();
  });

  const request = async (method, path, token, body) => {
    const res = await fetch(`${testApp.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  for (const role of ["admin", "antigo"]) {
    it(`${role} continua com importação, erros e edição de usuários`, async () => {
      const b2b = await User.findOne({ email: "b2b@teste.com" });

      assert.equal((await request("GET", "/logs", tokens[role])).status, 200);
      assert.equal((await request("GET", "/users", tokens[role])).status, 200);
      assert.equal((await request("PATCH", `/users/${b2b._id}`, tokens[role], { role: "b2b" })).status, 200);
    });
  }

  it("b2b continua sem acesso", async () => {
    assert.equal((await request("GET", "/logs", tokens.b2b)).status, 403);
    assert.equal((await request("GET", "/users", tokens.b2b)).status, 403);
  });

  it("a lista mostra os admins como master (é o que o front usa para liberar as telas)", async () => {
    const { body } = await request("GET", "/users", tokens.admin);
    const roleByEmail = Object.fromEntries(body.data.map((user) => [user.email, user.role]));

    assert.deepEqual(roleByEmail, { "admin@teste.com": "master", "antigo@teste.com": "master", "b2b@teste.com": "b2b" });
  });
});
