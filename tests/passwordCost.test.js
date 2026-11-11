const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Custo baixo nos testes (o atual); as senhas "antigas" abaixo são gravadas com custo maior
process.env.ROUND_ENCRYPTION = "4";

const bcrypt = require("bcrypt");

const { startTestApp } = require("./helpers/testApp");
const User = require("../features/user/model/userModel");
const passwordService = require("../features/security/service/passwordService");

describe("Custo da senha (bcrypt) e regravação no login", () => {
  let testApp;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  const login = async (password) => {
    const res = await fetch(`${testApp.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "vendedor@teste.com", password }),
    });
    return res.status;
  };

  const storedHash = async () => (await User.findOne({ email: "vendedor@teste.com" }).select("+passwordHash")).passwordHash;

  beforeEach(async () => {
    await User.deleteMany({});
    // Como as contas criadas antes, com custo maior que o atual
    const oldHash = await bcrypt.hash(`Vendedor123${process.env.PEPPER}`, 6);
    await User.collection.insertOne({ email: "vendedor@teste.com", passwordHash: oldHash, role: "admin" });
  });

  it("usa o custo de ROUND_ENCRYPTION; sem ela (ou inválida) o padrão é 10", () => {
    assert.equal(passwordService.rounds, 4);
    assert.equal(bcrypt.getRounds(bcrypt.hashSync("x", passwordService.rounds)), 4);
  });

  it("login com senha de custo antigo entra e regrava a senha com o custo atual; a senha continua a mesma", async () => {
    assert.equal(bcrypt.getRounds(await storedHash()), 6);

    assert.equal(await login("Vendedor123"), 200);
    assert.equal(bcrypt.getRounds(await storedHash()), 4);

    assert.equal(await login("Vendedor123"), 200);
    assert.equal(await login("OutraSenha1"), 401);
  });

  it("senha errada não regrava nada", async () => {
    const before = await storedHash();

    assert.equal(await login("SenhaErrada1"), 401);
    assert.equal(await storedHash(), before);
  });

  it("senha já no custo atual não é regravada", async () => {
    assert.equal(await login("Vendedor123"), 200);
    const current = await storedHash();

    assert.equal(await login("Vendedor123"), 200);
    assert.equal(await storedHash(), current);
  });

  it("needsRehash só pede regravar quando o custo gravado é maior; hash estranho não quebra", () => {
    assert.equal(passwordService.needsRehash(bcrypt.hashSync("x", 6)), true);
    assert.equal(passwordService.needsRehash(bcrypt.hashSync("x", 4)), false);
    assert.equal(passwordService.needsRehash("não é um hash"), false);
  });
});

describe("Custo padrão sem ROUND_ENCRYPTION", () => {
  it("é 10 (o antigo era 15)", () => {
    const { execFileSync } = require("node:child_process");
    const output = execFileSync(
      process.execPath,
      ["-e", 'console.log(require("./features/security/service/passwordService").rounds)'],
      { env: { ...process.env, ROUND_ENCRYPTION: "" }, cwd: `${__dirname}/..` },
    );
    assert.equal(String(output).trim(), "10");
  });
});
