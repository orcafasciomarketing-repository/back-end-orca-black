// Pontos e meta próprios dos testes, para não depender dos valores do .env.
// Precisam ser definidos ANTES do dotenv e dos requires do projeto: o pointsMap e a
// meta são montados no momento em que os arquivos de config são carregados,
// e o dotenv não sobrescreve variáveis que já existem.
const TEST_POINTS = { sales: 3, farm: 2, passage: 1 };

const TEST_GOAL = 9000;

process.env.POINTS_PER_SALE = String(TEST_POINTS.sales);
process.env.POINTS_PER_FARM = String(TEST_POINTS.farm);
process.env.POINTS_PER_PASSAGE = String(TEST_POINTS.passage);
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

  // Garante que os índices únicos (rdDealId, nomes) já existem antes dos testes
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

// Cadastro base: 3 times, vendors e SDRs (encontrados pelo nome, como na planilha)
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

  const [sdrB, sdrC, csB] = await SDR.create([
    { name: "SDR B", teamId: teamB._id, job: "sdr" },
    { name: "Suporte C", teamId: teamC._id, job: "suporte" },
    { name: "CS B", teamId: teamB._id, job: "cs" },
  ]);

  return { teamA, teamB, teamC, vendorA1, vendorA2, vendorB1, vendorC1, sdrB, sdrC, csB };
};

exports.clearDatabase = async () => {
  await Promise.all([
    Sales.deleteMany({}),
    Vendors.deleteMany({}),
    SDR.deleteMany({}),
    Teams.deleteMany({}),
  ]);
};

// Monta uma linha no formato que o Apps Script envia: as chaves são os nomes das
// colunas da planilha, mais "linha" e "Atualizado em" (adicionados pelo script)
exports.buildSheetRow = ({
  id = "venda-1",
  company = "Empresa Teste",
  vendor = "Vendor A1",
  passages = "",
  sector = "B2B",
  classification = "",
  value = 1000,
  saleDate = "2026-11-27T03:00:00.000Z",
  status = "Concluída",
  updatedAt = "2026-11-27T13:00:00.123Z",
  row = 2,
} = {}) => ({
  linha: row,
  "Id da empresa": company,
  Passagens: passages,
  Vendedor: vendor,
  Setor: sector,
  "Classificação": classification,
  "Valor da venda": value,
  "Data da venda": saleDate,
  Status: status,
  "Id da venda": id,
  "Atualizado em": updatedAt,
});

// Envia igual ao Apps Script: lista de linhas, segredo no header "webhook_secret".
// Aceita uma linha solta ou uma lista. Sem secret, usa o WEBHOOK_SECRET do .env;
// passe outro valor para testar recusas, ou null para mandar sem o header.
exports.sendSheet = async (baseUrl, rows, secret) => {
  const headerValue = secret === undefined ? process.env.WEBHOOK_SECRET : secret;
  const headers = { "Content-Type": "application/json" };
  if (headerValue !== null) headers.webhook_secret = headerValue;

  return await fetch(`${baseUrl}/sales/webhook/sheet`, {
    method: "POST",
    headers,
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
};

exports.TEST_POINTS = TEST_POINTS;
exports.TEST_GOAL = TEST_GOAL;
