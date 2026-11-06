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

  // Metas de setor são opcionais (sem elas vale a BLACK_FRIDAY_GOAL), mas se
  // existirem precisam vir as duas e somar a meta total
  const hasSegmentGoals = env.BLACK_FRIDAY_GOAL_B2B !== undefined || env.BLACK_FRIDAY_GOAL_B2G !== undefined;
  it("BLACK_FRIDAY_GOAL_B2B e _B2G: as duas maiores que zero e somando a BLACK_FRIDAY_GOAL", { skip: !hasSegmentGoals && "metas de setor não configuradas" }, () => {
    const b2b = Number(env.BLACK_FRIDAY_GOAL_B2B);
    const b2g = Number(env.BLACK_FRIDAY_GOAL_B2G);
    assert.ok(b2b > 0, "BLACK_FRIDAY_GOAL_B2B vazio ou inválido");
    assert.ok(b2g > 0, "BLACK_FRIDAY_GOAL_B2G vazio ou inválido");
    assert.equal(b2b + b2g, Number(env.BLACK_FRIDAY_GOAL), "a soma das metas de setor é diferente da BLACK_FRIDAY_GOAL");
  });

  for (const name of POINTS_VARS) {
    it(`${name} é um número`, () => {
      assert.ok(env[name] !== undefined && env[name] !== "", `${name} vazio`);
      assert.equal(Number.isNaN(Number(env[name])), false, `${name} não é número`);
    });
  }
});
