const { isValidObjectId } = require("mongoose");

const PrizeRepository = require("../repository/prizeRepository");
const AnalyticsService = require("../../analytics/service/analyticsService");
const VendorsService = require("../../vendors/service/vendorsService");
const SdrService = require("../../sdr/service/sdrService");
const { PRIZE_POINTS_STEP } = require("../../../config/prizes");
const { ConflictError, NotFoundError } = require("../../../shared/errors");
const { prizeWeekOf, personKeyOf, buildPrizeSummary } = require("./prizeCalculator");

// Setor da pessoa pelo cargo ("B2B Farmer", "B2G SDR"...). CS e Suporte não têm setor (null)
const segmentOfJob = (job) => {
  const match = String(job ?? "").trim().toLowerCase().match(/^(b2b|b2g)\b/);
  return match ? match[1] : null;
};

// segment null (master e admin) = todo mundo; b2b/b2g = só as pessoas do setor
const inSegment = (segment) => (person) => !segment || segmentOfJob(person.job) === segment;

const withdrawalsPlural = (amount) => `${amount} ${Math.abs(amount) === 1 ? "prêmio" : "prêmios"}`;

// Saldo de todas as pessoas. Os pontos são os mesmos de "Pontos por pessoa", de todos os setores:
// o prêmio é da pessoa, não do setor da venda
exports.getSummary = async (segment = null, now = new Date()) => {
  const week = prizeWeekOf(now);
  const [closed, current, withdrawals] = await Promise.all([
    AnalyticsService.getPeoplePoints({ to: week.closedUntil }),
    AnalyticsService.getPeoplePoints({ from: week.start }),
    PrizeRepository.findAll(),
  ]);

  const people = buildPrizeSummary({
    closedPeople: closed.people,
    currentPeople: current.people,
    withdrawals,
    step: PRIZE_POINTS_STEP,
  }).filter(inSegment(segment));

  return {
    segment,
    step: PRIZE_POINTS_STEP,
    today: week.today,
    closedUntil: week.closedUntil,
    currentWeek: { start: week.start, end: week.end },
    teams: closed.teams,
    people,
  };
};

// Histórico de retiradas, com o nome e o cargo de cada pessoa
exports.getWithdrawals = async (segment = null, { kind, personId } = {}) => {
  const [withdrawals, vendors, sdrs] = await Promise.all([
    kind && personId ? PrizeRepository.findByPerson(kind, personId) : PrizeRepository.findAll(),
    VendorsService.findAll(),
    SdrService.findAll(),
  ]);

  const people = new Map([
    ...vendors.map((vendor) => [personKeyOf("vendor", vendor._id), { name: vendor.vendorName, job: vendor.job }]),
    ...sdrs.map((sdr) => [personKeyOf("sdr", sdr._id), { name: sdr.name, job: sdr.job }]),
  ]);

  return withdrawals
    .map((withdrawal) => {
      const person = people.get(personKeyOf(withdrawal.kind, withdrawal.personId));
      return {
        _id: withdrawal._id,
        personId: withdrawal.personId,
        kind: withdrawal.kind,
        name: person?.name ?? "Pessoa removida",
        job: person?.job ?? null,
        quantity: withdrawal.quantity,
        prize: withdrawal.prize,
        withdrawnAt: withdrawal.withdrawnAt,
        createdBy: withdrawal.createdBy,
        createdAt: withdrawal.createdAt,
      };
    })
    .filter(inSegment(segment));
};

// Acima do saldo só registra com confirmOverBalance (a tela avisa e pede confirmação antes)
exports.createWithdrawal = async (data, createdBy, now = new Date()) => {
  const { confirmOverBalance, ...withdrawal } = data;

  const person =
    withdrawal.kind === "vendor"
      ? await VendorsService.findById(withdrawal.personId)
      : await SdrService.findById(withdrawal.personId);
  if (!person) throw NotFoundError("Pessoa não encontrada");

  const summary = await exports.getSummary(null, now);
  const key = personKeyOf(withdrawal.kind, withdrawal.personId);
  const balance = summary.people.find((item) => personKeyOf(item.kind, item.personId) === key)?.balance ?? 0;

  if (withdrawal.quantity > balance && !confirmOverBalance) {
    const name = withdrawal.kind === "vendor" ? person.vendorName : person.name;
    throw ConflictError(`${name} tem saldo de ${withdrawalsPlural(balance)}. Confirme para registrar mesmo assim`);
  }

  return await PrizeRepository.create({ ...withdrawal, createdBy });
};

exports.deleteWithdrawal = async (id) => {
  const deleted = isValidObjectId(id) ? await PrizeRepository.deleteById(id) : null;
  if (!deleted) throw NotFoundError("Retirada não encontrada");
  return deleted;
};

exports.segmentOfJob = segmentOfJob;
