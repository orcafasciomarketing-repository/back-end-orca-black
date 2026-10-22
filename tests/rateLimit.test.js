const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const { rateLimit } = require("../middlewares/rateLimitMiddleware");

// Chama o middleware com req/res falsos e diz se a requisição passou (next) ou foi barrada (429)
const callLimiter = (limiter, ip) => {
  let status = null;
  let passed = false;

  const req = { ip };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  };

  limiter(req, res, () => {
    passed = true;
  });

  return passed ? "passou" : status;
};

describe("rateLimitMiddleware", () => {
  afterEach(() => mock.timers.reset());

  it("deixa passar até o máximo e barra com 429 depois", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 2 });

    assert.equal(callLimiter(limiter, "1.1.1.1"), "passou");
    assert.equal(callLimiter(limiter, "1.1.1.1"), "passou");
    assert.equal(callLimiter(limiter, "1.1.1.1"), 429);
  });

  it("cada IP tem a sua contagem", () => {
    const limiter = rateLimit({ windowMs: 60000, max: 1 });

    assert.equal(callLimiter(limiter, "1.1.1.1"), "passou");
    assert.equal(callLimiter(limiter, "2.2.2.2"), "passou");
    assert.equal(callLimiter(limiter, "1.1.1.1"), 429);
  });

  it("quando a janela acaba, a contagem recomeça", () => {
    mock.timers.enable({ apis: ["Date"], now: 0 });
    const limiter = rateLimit({ windowMs: 60000, max: 1 });

    assert.equal(callLimiter(limiter, "1.1.1.1"), "passou");
    assert.equal(callLimiter(limiter, "1.1.1.1"), 429);

    mock.timers.tick(60000);

    assert.equal(callLimiter(limiter, "1.1.1.1"), "passou");
  });

  it("cada limitador criado tem contagem própria", () => {
    const limiterA = rateLimit({ windowMs: 60000, max: 1 });
    const limiterB = rateLimit({ windowMs: 60000, max: 1 });

    assert.equal(callLimiter(limiterA, "1.1.1.1"), "passou");
    assert.equal(callLimiter(limiterB, "1.1.1.1"), "passou");
  });
});
