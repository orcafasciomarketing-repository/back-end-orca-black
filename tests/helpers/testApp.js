// Etapas e pontos próprios dos testes, para não depender dos ids reais da RD
// nem dos pontos que o comercial ainda vai definir.
// Precisam ser definidos ANTES do dotenv e dos requires do projeto: o STAGE_MAP e
// o pointsMap são montados no momento em que os arquivos de config são carregados,
// e o dotenv não sobrescreve variáveis que já existem.
const TEST_STAGES = {
  B2B_SALES: "stage-b2b-sales",
  B2B_FARM: "stage-b2b-farm",
  B2G_SALES: "stage-b2g-sales",
  B2G_FARM: "stage-b2g-farm",
  OUTSIDE: "stage-fora-do-mapa",
};

const TEST_POINTS = { sales: 3, farm: 2, passage: 1 };

const TEST_PASSAGE_FIELD_ID = "cf-passagem";

const TEST_GOAL = 9000;

process.env.B2B_FUNIL_BLACKFRIDAY_SALES = TEST_STAGES.B2B_SALES;
process.env.B2B_FUNIL_BLACKFRIDAY_FARM = TEST_STAGES.B2B_FARM;
process.env.B2G_FUNIL_BLACKFRIDAY_SALES = TEST_STAGES.B2G_SALES;
process.env.B2G_FUNIL_BLACKFRIDAY_FARM = TEST_STAGES.B2G_FARM;
process.env.POINTS_PER_SALE = String(TEST_POINTS.sales);
process.env.POINTS_PER_FARM = String(TEST_POINTS.farm);
process.env.POINTS_PER_PASSAGE = String(TEST_POINTS.passage);
process.env.RD_PASSAGE_CUSTOM_FIELD_ID = TEST_PASSAGE_FIELD_ID;
process.env.BLACK_FRIDAY_GOAL = String(TEST_GOAL);

// O WEBHOOK_SECRET e o JWT_SECRET vêm do .env de verdade
require("dotenv").config({ quiet: true });

const { once } = require("node:events");
const { mock } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { app } = require("../../app");
const Sales = require("../../features/sale/model/salesModel");
const Vendors = require("../../features/vendors/model/vendorsModel");
const SDR = require("../../features/sdr/model/sdrModel");
const Teams = require("../../features/teams/model/teamsModel");

// Sobe um MongoDB temporário em memória (nunca usa o MONGO_URI do .env)
// e o app Express numa porta livre.
exports.startTestApp = async () => {
  // O service tem console.log de debug; silencia para a saída dos testes ficar legível
  mock.method(console, "log", () => {});

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  // Garante que os índices únicos (rdDealId, rdUserId) já existem antes dos testes
  await Promise.all([Sales.init(), Vendors.init(), SDR.init()]);

  const server = app.listen(0);
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const stop = async () => {
    server.closeAllConnections();
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
    mock.restoreAll();
  };

  return { baseUrl, stop };
};

// Cadastro base: 3 times, vendors e SDRs com ids da RD fictícios
exports.seedBase = async () => {
  const [teamA, teamB, teamC] = await Teams.create([
    { name: "Time A", imageUrl: "http://teste/camiseta_amarela.png" },
    { name: "Time B", imageUrl: "http://teste/camiseta_verde.png" },
    { name: "Time C", imageUrl: "http://teste/camiseta_azul.png" },
  ]);

  const [vendorA1, vendorA2, vendorB1, vendorC1] = await Vendors.create([
    { rdUserId: "rd-user-a1", vendorName: "Vendor A1", teamId: teamA._id, job: "Executivo Venda" },
    { rdUserId: "rd-user-a2", vendorName: "Vendor A2", teamId: teamA._id, job: "Executivo Farmer" },
    { rdUserId: "rd-user-b1", vendorName: "Vendor B1", teamId: teamB._id, job: "Executivo Venda" },
    { rdUserId: "rd-user-c1", vendorName: "Vendor C1", teamId: teamC._id, job: "Executivo Venda" },
  ]);

  const [sdrB, sdrC] = await SDR.create([
    { name: "SDR B", teamId: teamB._id, job: "sdr" },
    { name: "Suporte C", teamId: teamC._id, job: "suporte" },
  ]);

  return { teamA, teamB, teamC, vendorA1, vendorA2, vendorB1, vendorC1, sdrB, sdrC };
};

exports.clearDatabase = async () => {
  await Promise.all([
    Sales.deleteMany({}),
    Vendors.deleteMany({}),
    SDR.deleteMany({}),
    Teams.deleteMany({}),
  ]);
};

// Monta um payload no formato do webhook da RD (só os campos que o adapter lê).
// deal_custom_fields segue o formato real: a RD manda o campo mesmo vazio, com value null.
exports.buildRdPayload = ({
  dealId = "rd-deal-1",
  dealName = "Deal de teste",
  stageId = TEST_STAGES.B2B_SALES,
  status = "won",
  updatedAt = "2026-11-27T13:00:00.123Z",
  amount = 1000,
  rdUserId = "rd-user-a1",
  passageName = null,
} = {}) => ({
  document: {
    id: dealId,
    name: dealName,
    amount_total: amount,
    deal_stage: { id: stageId },
    updated_at: updatedAt,
    user: { id: rdUserId },
    status,
    deal_custom_fields: [
      {
        value: "Construtora",
        custom_field: {
          id: "cf-segmento",
          label: "Segmento da Empresa",
          opts: ["Construtora", "Incorporadora"],
          type: "option",
        },
      },
      {
        value: passageName,
        custom_field: {
          id: TEST_PASSAGE_FIELD_ID,
          label: "Passagem",
          opts: ["SDR B", "Suporte C"],
          type: "option",
        },
      },
    ],
  },
});

// Envia o webhook igual a RD: secret no header "webhook_secret".
// Passe secret = null para mandar a requisição sem o header.
exports.sendWebhook = async (baseUrl, payload, secret = process.env.WEBHOOK_SECRET) => {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) headers.webhook_secret = secret;

  return await fetch(`${baseUrl}/sales/webhook/deal`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
};

exports.TEST_STAGES = TEST_STAGES;
exports.TEST_POINTS = TEST_POINTS;
exports.TEST_PASSAGE_FIELD_ID = TEST_PASSAGE_FIELD_ID;
exports.TEST_GOAL = TEST_GOAL;
