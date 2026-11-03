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

const POINTS_VARS = [
  "POINTS_B2G_SALE",
  "POINTS_B2G_FARM",
  "POINTS_B2G_SDR",
  "POINTS_B2B_SALE",
  "POINTS_B2B_FARM",
  "POINTS_B2B_SDR",
  "POINTS_CS",
  "POINTS_SUPORTE",
];

describe("Configuração do .env", { skip: !hasEnvFile && "sem arquivo .env" }, () => {
  it("WEBHOOK_SECRET está preenchido", () => {
    assert.ok(env.WEBHOOK_SECRET, "WEBHOOK_SECRET vazio");
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
