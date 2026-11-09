const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { prizeWeekOf, buildPrizeBalance, buildPrizeSummary } = require("../features/prizes/service/prizeCalculator");

const STEP = 10;

describe("prizeCalculator", () => {
  it("a sobra passa para a semana seguinte: 15 pontos dão 1 prêmio; +5 na outra semana (20) dão o 2º", () => {
    const firstWeek = buildPrizeBalance({ accumulated: 15, step: STEP });
    assert.deepEqual(
      { earned: firstWeek.earned, balance: firstWeek.balance },
      { earned: 1, balance: 1 },
    );

    // Retirou 1 na segunda; na semana seguinte fez mais 5
    const secondWeek = buildPrizeBalance({ accumulated: 20, withdrawn: 1, step: STEP });
    assert.deepEqual(
      { earned: secondWeek.earned, balance: secondWeek.balance },
      { earned: 2, balance: 1 },
    );
  });

  it("venda cancelada depois da retirada: fica devendo e a venda nova só paga a dívida", () => {
    // Fez 10 e retirou
    assert.equal(buildPrizeBalance({ accumulated: 10, withdrawn: 1, step: STEP }).balance, 0);

    // Venda de 3 pontos cancelada: 7 pontos, devendo 3
    const cancelled = buildPrizeBalance({ accumulated: 7, withdrawn: 1, step: STEP });
    assert.equal(cancelled.balance, -1);
    assert.equal(cancelled.debtPoints, 3);
    assert.equal(cancelled.pointsToNext, 13);

    // Venda nova de 3: volta para 10, saldo 0 (não ganha outro prêmio)
    const replaced = buildPrizeBalance({ accumulated: 10, withdrawn: 1, step: STEP });
    assert.equal(replaced.balance, 0);
    assert.equal(replaced.debtPoints, 0);

    // Mais 10 pontos: aí sim ganha o próximo
    assert.equal(buildPrizeBalance({ accumulated: 20, withdrawn: 1, step: STEP }).balance, 1);
  });

  it("a semana em andamento conta: 18 pontos antes + 2 nesta semana = 20, 2 prêmios já", () => {
    const balance = buildPrizeBalance({ accumulated: 20, currentWeek: 2, step: STEP });
    assert.equal(balance.earned, 2);
    assert.equal(balance.balance, 2);
    assert.equal(balance.currentWeek, 2);
    assert.equal(balance.nextPrizeAt, 30);
    assert.equal(balance.pointsToNext, 10);
  });

  it("semana de segunda a domingo, no horário de São Paulo", () => {
    assert.deepEqual(prizeWeekOf(new Date("2026-11-09T12:00:00Z")), {
      today: "2026-11-09",
      start: "2026-11-09",
      end: "2026-11-15",
    });

    // Domingo 15/11 ainda é a mesma semana
    assert.equal(prizeWeekOf(new Date("2026-11-15T20:00:00Z")).start, "2026-11-09");

    // 01:00 UTC de segunda 16/11 ainda é domingo 22:00 em São Paulo
    assert.equal(prizeWeekOf(new Date("2026-11-16T01:00:00Z")).start, "2026-11-09");
  });

  it("resumo: junta as retiradas de cada pessoa e põe quem tem mais saldo primeiro", () => {
    const person = (kind, personId, name, total) => ({ kind, personId, name, job: "x", total });
    const people = buildPrizeSummary({
      allPeople: [person("vendor", "1", "Ana", 25), person("sdr", "1", "Bia", 32), person("vendor", "2", "Caio", 4)],
      currentPeople: [person("vendor", "1", "Ana", 2), person("sdr", "1", "Bia", 0), person("vendor", "2", "Caio", 1)],
      // Mesmo id em coleções diferentes: as retiradas da Ana não podem cair na Bia
      withdrawals: [
        { kind: "vendor", personId: "1", quantity: 1 },
        { kind: "vendor", personId: "1", quantity: 1 },
        { kind: "sdr", personId: "1", quantity: 1 },
      ],
      step: STEP,
    });

    assert.deepEqual(
      people.map((item) => [item.name, item.earned, item.withdrawn, item.balance, item.currentWeek]),
      [
        ["Bia", 3, 1, 2, 0],
        ["Ana", 2, 2, 0, 2],
        ["Caio", 0, 0, 0, 1],
      ],
    );
  });
});
