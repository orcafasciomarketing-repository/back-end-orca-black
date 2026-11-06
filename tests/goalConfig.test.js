const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const GOAL_VARS = ["BLACK_FRIDAY_GOAL", "BLACK_FRIDAY_GOAL_B2B", "BLACK_FRIDAY_GOAL_B2G"];
const originalEnv = Object.fromEntries(GOAL_VARS.map((name) => [name, process.env[name]]));
const goalPath = require.resolve("../config/goal.js");

// O config lê as variáveis ao carregar: carrega de novo a cada cenário
const loadGoalConfig = (env) => {
  for (const name of GOAL_VARS) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
  delete require.cache[goalPath];
  return require(goalPath);
};

describe("config/goal.js (meta total e meta por setor)", () => {
  afterEach(() => {
    loadGoalConfig(originalEnv);
  });

  it("com as duas metas de setor: a meta total é a soma delas", () => {
    const config = loadGoalConfig({
      BLACK_FRIDAY_GOAL: "3000000",
      BLACK_FRIDAY_GOAL_B2B: "2000000",
      BLACK_FRIDAY_GOAL_B2G: "1000000",
    });

    assert.equal(config.BLACK_FRIDAY_GOAL, 3000000);
    assert.deepEqual(config.SEGMENT_GOALS, { b2b: 2000000, b2g: 1000000 });
  });

  it("sem as metas de setor (deploy antes de criar as variáveis): continua a BLACK_FRIDAY_GOAL", () => {
    const config = loadGoalConfig({ BLACK_FRIDAY_GOAL: "3000000" });

    assert.equal(config.BLACK_FRIDAY_GOAL, 3000000);
    assert.deepEqual(config.SEGMENT_GOALS, { b2b: 0, b2g: 0 });
  });

  it("só uma meta de setor configurada: a meta total não muda", () => {
    const config = loadGoalConfig({ BLACK_FRIDAY_GOAL: "3000000", BLACK_FRIDAY_GOAL_B2B: "2000000" });

    assert.equal(config.BLACK_FRIDAY_GOAL, 3000000);
    assert.deepEqual(config.SEGMENT_GOALS, { b2b: 2000000, b2g: 0 });
  });

  it("nada configurado: tudo 0", () => {
    const config = loadGoalConfig({});

    assert.equal(config.BLACK_FRIDAY_GOAL, 0);
    assert.deepEqual(config.SEGMENT_GOALS, { b2b: 0, b2g: 0 });
  });
});
