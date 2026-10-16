const { describe, it, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ quiet: true });

const SalesRepository = require("../features/sale/repository/salesRepository");
const SalesService = require("../features/sale/service/salesService");

// Testes sem banco: o repository é substituído por um mock que só guarda
// as datas recebidas, e o relógio (Date) é fixado com mock.timers.
describe("SalesService.findActiveByPeriod (cálculo da semana)", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  // Fixa o "agora" e devolve as datas que o service mandou para o repository
  const getRangeAt = async (nowIso, period) => {
    mock.timers.enable({ apis: ["Date"], now: new Date(nowIso) });
    const findMock = mock.method(SalesRepository, "findActiveByRealizedAt", async () => []);

    await SalesService.findActiveByPeriod(period);

    const [startDate, endDate] = findMock.mock.calls[0].arguments;
    return { startDate, endDate };
  };

  it("quarta-feira: semana vai de segunda 00:00 a domingo 23:59:59.999 (São Paulo)", async () => {
    // 14/10/2026 12:00 em São Paulo
    const { startDate, endDate } = await getRangeAt("2026-10-14T15:00:00Z", "week");

    assert.equal(startDate.toISOString(), "2026-10-12T03:00:00.000Z"); // seg 12/10 00:00 SP
    assert.equal(endDate.toISOString(), "2026-10-19T02:59:59.999Z"); // dom 18/10 23:59:59.999 SP
  });

  it("domingo 23:30 em SP (já é segunda em UTC) ainda conta na semana que está acabando", async () => {
    const { startDate, endDate } = await getRangeAt("2026-10-19T02:30:00Z", "week");

    assert.equal(startDate.toISOString(), "2026-10-12T03:00:00.000Z");
    assert.equal(endDate.toISOString(), "2026-10-19T02:59:59.999Z");
  });

  it("segunda 00:30 em SP já é a semana nova", async () => {
    const { startDate, endDate } = await getRangeAt("2026-10-19T03:30:00Z", "week");

    assert.equal(startDate.toISOString(), "2026-10-19T03:00:00.000Z");
    assert.equal(endDate.toISOString(), "2026-10-26T02:59:59.999Z");
  });

  it("semana que atravessa a virada do mês", async () => {
    // domingo 01/11/2026 09:00 em São Paulo
    const { startDate, endDate } = await getRangeAt("2026-11-01T12:00:00Z", "week");

    assert.equal(startDate.toISOString(), "2026-10-26T03:00:00.000Z");
    assert.equal(endDate.toISOString(), "2026-11-02T02:59:59.999Z");
  });

  it("lastWeek: semana anterior inteira, de segunda a domingo", async () => {
    const { startDate, endDate } = await getRangeAt("2026-10-14T15:00:00Z", "lastWeek");

    assert.equal(startDate.toISOString(), "2026-10-05T03:00:00.000Z");
    assert.equal(endDate.toISOString(), "2026-10-12T02:59:59.999Z");
  });

  it("all: chama o repository sem datas (campanha toda)", async () => {
    const { startDate, endDate } = await getRangeAt("2026-10-14T15:00:00Z", "all");

    assert.equal(startDate, undefined);
    assert.equal(endDate, undefined);
  });
});

describe("SalesService.findActiveByWeek (rota /sales/get)", () => {
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  it("usa a mesma semana de segunda a domingo (antes terminava na sexta)", async () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-14T15:00:00Z") });
    const findMock = mock.method(SalesRepository, "findByPeriod", async () => ({ data: [], total: 0 }));

    await SalesService.findActiveByWeek(1, 10);

    const [page, limit, startDate, endDate] = findMock.mock.calls[0].arguments;
    assert.equal(page, 1);
    assert.equal(limit, 10);
    assert.equal(startDate.toISOString(), "2026-10-12T03:00:00.000Z");
    assert.equal(endDate.toISOString(), "2026-10-19T02:59:59.999Z");
  });
});
