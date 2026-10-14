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

const STAGE_VARS = [
  "B2B_FUNIL_BLACKFRIDAY_SALES",
  "B2B_FUNIL_BLACKFRIDAY_FARM",
  "B2G_FUNIL_BLACKFRIDAY_SALES",
  "B2G_FUNIL_BLACKFRIDAY_FARM",
];

const POINTS_VARS = ["POINTS_PER_SALE", "POINTS_PER_FARM", "POINTS_PER_PASSAGE"];

describe("Configuração do .env", { skip: !hasEnvFile && "sem arquivo .env" }, () => {
  it("WEBHOOK_SECRET está preenchido", () => {
    assert.ok(env.WEBHOOK_SECRET, "WEBHOOK_SECRET vazio");
  });

  for (const name of STAGE_VARS) {
    it(`${name} está preenchido`, () => {
      assert.ok(env[name], `${name} está vazio: deals dessa etapa não viram venda`);
    });
  }

  it("as quatro etapas têm ids diferentes", () => {
    const stageIds = STAGE_VARS.map((name) => env[name]).filter(Boolean);

    assert.equal(new Set(stageIds).size, stageIds.length);
  });

  it("BLACK_FRIDAY_GOAL é um número maior que zero", () => {
    assert.ok(Number(env.BLACK_FRIDAY_GOAL) > 0, "BLACK_FRIDAY_GOAL vazio ou inválido");
  });

  it("RD_PASSAGE_CUSTOM_FIELD_ID está preenchido", () => {
    assert.ok(
      env.RD_PASSAGE_CUSTOM_FIELD_ID,
      "RD_PASSAGE_CUSTOM_FIELD_ID vazio: nenhuma passagem será vinculada",
    );
  });

  for (const name of POINTS_VARS) {
    it(`${name} é um número`, () => {
      assert.ok(env[name] !== undefined && env[name] !== "", `${name} vazio`);
      assert.equal(Number.isNaN(Number(env[name])), false, `${name} não é número`);
    });
  }
});
