const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

// Confere o .env de verdade (item do checklist antes da campanha).
// Lê o arquivo sem carregar no process.env, para não interferir nos outros testes.
const envPath = path.join(__dirname, "..", ".env");
const hasEnvFile = fs.existsSync(envPath);
const env = hasEnvFile ? dotenv.parse(fs.readFileSync(envPath)) : {};

const POINTS_VARS = ["POINTS_PER_SALE", "POINTS_PER_FARM", "POINTS_PER_PASSAGE"];

describe("Configuração do .env", { skip: !hasEnvFile && "sem arquivo .env" }, () => {
  it("WEBHOOK_SECRET está preenchido", () => {
    assert.ok(env.WEBHOOK_SECRET, "WEBHOOK_SECRET vazio");
  });

  it("WEBHOOK_CRYPTO_PEPPER está preenchido (sem ele o backend recusa a planilha)", () => {
    assert.ok(env.WEBHOOK_CRYPTO_PEPPER, "WEBHOOK_CRYPTO_PEPPER vazio");
  });

  it("BLACK_FRIDAY_GOAL é um número maior que zero", () => {
    assert.ok(Number(env.BLACK_FRIDAY_GOAL) > 0, "BLACK_FRIDAY_GOAL vazio ou inválido");
  });

  for (const name of POINTS_VARS) {
    it(`${name} é um número`, () => {
      assert.ok(env[name] !== undefined && env[name] !== "", `${name} vazio`);
      assert.equal(Number.isNaN(Number(env[name])), false, `${name} não é número`);
    });
  }
});
