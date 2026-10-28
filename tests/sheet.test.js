const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildSheetRow,
  sendSheet,
  TEST_POINTS,
} = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const SDR = require("../features/sdr/model/sdrModel");
const { generateAccessToken } = require("../shared/accessTokenService");

const T1 = "2026-11-27T13:00:00.100Z";
const T2 = "2026-11-27T13:05:00.200Z";
const T3 = "2026-11-27T13:10:00.300Z";

describe("Planilha (POST /sales/webhook/sheet)", () => {
  let testApp;
  let seed;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  beforeEach(async () => {
    await clearDatabase();
    seed = await seedBase();
  });

  const findSale = async (id = "venda-1") => await Sales.findOne({ rdDealId: id }).lean();

  // Envia e devolve a lista de resultados por linha (o que o Apps Script vê no log)
  const sendAndGetResults = async (rows) => {
    const res = await sendSheet(testApp.baseUrl, rows);
    const body = await res.json();
    return body.data;
  };

  const getScoreboardTeam = async (teamName) => {
    const res = await fetch(`${testApp.baseUrl}/analytics/scoreboard`);
    const { data } = await res.json();
    return data.find((team) => team.teamName === teamName);
  };

  describe("segredo do header webhook_secret (mesmo valor do WEBHOOK_SECRET do .env)", () => {
    // Troca uma variável de ambiente só durante o teste
    const withEnv = async (name, value, run) => {
      const original = process.env[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
      try {
        await run();
      } finally {
        process.env[name] = original;
      }
    };

    it("WEBHOOK_SECRET precisa existir no .env para estes testes fazerem sentido", () => {
      assert.ok(process.env.WEBHOOK_SECRET, "WEBHOOK_SECRET não está no .env");
    });

    it("segredo certo → 200 com o resultado de cada linha", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow());
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.deepEqual(body.data, [{ linha: 2, idVenda: "venda-1", status: "criada" }]);
    });

    it("segredo no header x-webhook-secret também é aceito", async () => {
      const res = await fetch(`${testApp.baseUrl}/sales/webhook/sheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": process.env.WEBHOOK_SECRET },
        body: JSON.stringify([buildSheetRow()]),
      });

      assert.equal(res.status, 200);
    });

    it("segredo errado → 401 e nada é salvo", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow(), "segredo-errado");

      assert.equal(res.status, 401);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("segredo com um caractere a mais → 401", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow(), `${process.env.WEBHOOK_SECRET}x`);

      assert.equal(res.status, 401);
    });

    it("sem o header → 401 e nada é salvo", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow(), null);

      assert.equal(res.status, 401);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("a resposta de 401 não devolve o segredo", async () => {
      const res = await sendSheet(testApp.baseUrl, buildSheetRow(), "qualquer-coisa");
      const body = await res.text();

      assert.equal(body.includes(process.env.WEBHOOK_SECRET), false);
    });

    it("WEBHOOK_SECRET ausente no servidor → recusa tudo", async () => {
      const validSecret = process.env.WEBHOOK_SECRET;

      await withEnv("WEBHOOK_SECRET", undefined, async () => {
        const res = await sendSheet(testApp.baseUrl, buildSheetRow(), validSecret);
        assert.equal(res.status, 401);
      });
    });
  });

  describe("mapeamento das colunas", () => {
    it("linha concluída → venda ativa com os dados da planilha", async () => {
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ company: "ACME", value: 10000, saleDate: "2026-10-03T03:00:00.000Z" }),
      );
      const sale = await findSale();

      assert.equal(sale.dealStatus, "ativa");
      assert.equal(sale.rdDealName, "ACME");
      assert.equal(sale.value, 10000);
      assert.equal(sale.segment, "b2b");
      assert.equal(sale.funnelType, "sales");
      assert.equal(sale.vendorId.toString(), seed.vendorA1._id.toString());
      assert.equal(sale.realizedAt.toISOString(), "2026-10-03T03:00:00.000Z");
      assert.equal(sale.rdUpdatedAt.toISOString(), "2026-11-27T13:00:00.123Z");
    });

    it("Classificação \"Renovação\" → farm; vazia → sales", async () => {
      await sendSheet(testApp.baseUrl, [
        buildSheetRow({ id: "renovacao", classification: "Renovação" }),
        buildSheetRow({ id: "venda", classification: "" }),
      ]);

      assert.equal((await findSale("renovacao")).funnelType, "farm");
      assert.equal((await findSale("venda")).funnelType, "sales");
    });

    it("Setor B2G → b2g (sem diferenciar maiúsculas)", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ sector: "b2g" }));

      assert.equal((await findSale()).segment, "b2g");
    });

    it("vendedor encontrado pelo nome", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ vendor: "Vendor B1" }));

      assert.equal((await findSale()).vendorId.toString(), seed.vendorB1._id.toString());
    });

    it("payload real do print da planilha (sem Id da venda) → erro claro, nada salvo", async () => {
      const results = await sendAndGetResults({
        linha: 2,
        "Id da empresa": "teste",
        Passagens: "",
        Vendedor: "Vendor A1",
        Setor: "B2B",
        "Classificação": "Renovação",
        "Valor da venda": 10000,
        "Data da venda": "2026-10-03T03:00:00.000Z",
        Status: "Concluída",
      });

      assert.deepEqual(results, [
        { linha: 2, idVenda: "", status: "erro", mensagem: "Linha sem Id da venda" },
      ]);
      assert.equal(await Sales.countDocuments(), 0);
    });
  });

  describe("linhas com problema (não impedem as outras do lote)", () => {
    it("vendedor não cadastrado → erro na linha e nada salvo", async () => {
      const results = await sendAndGetResults(buildSheetRow({ vendor: "Pessoa Desconhecida" }));

      assert.equal(results[0].status, "erro");
      assert.match(results[0].mensagem, /Vendedor "Pessoa Desconhecida" não cadastrado/);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("dados faltando → erro com todos os problemas da linha", async () => {
      const results = await sendAndGetResults(
        buildSheetRow({ vendor: "", sector: "GOV", value: "", saleDate: "" }),
      );

      assert.equal(results[0].status, "erro");
      for (const problem of ["Vendedor vazio", "Setor precisa ser B2B ou B2G", "Valor da venda inválido", "Data da venda inválida"]) {
        assert.ok(results[0].mensagem.includes(problem), problem);
      }
    });

    it("sem Atualizado em → erro", async () => {
      const results = await sendAndGetResults(buildSheetRow({ updatedAt: "" }));

      assert.deepEqual(results[0].status, "erro");
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("lote com uma linha errada → as certas são gravadas", async () => {
      const results = await sendAndGetResults([
        buildSheetRow({ id: "ok-1", row: 2 }),
        buildSheetRow({ id: "erro", row: 3, vendor: "Pessoa Desconhecida" }),
        buildSheetRow({ id: "ok-2", row: 4 }),
      ]);

      assert.deepEqual(results.map((result) => result.status), ["criada", "erro", "criada"]);
      assert.equal(await Sales.countDocuments(), 2);
    });
  });

  describe("ciclo de vida da venda", () => {
    it("mesma linha reenviada (sincronização) → não duplica", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      const results = await sendAndGetResults(buildSheetRow({ updatedAt: T2 }));

      assert.equal(results[0].status, "atualizada");
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("mesma linha enviada várias vezes ao mesmo tempo → uma venda só", async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }))),
      );

      assert.deepEqual(responses.map((res) => res.status), [200, 200, 200, 200, 200]);
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("valor e data corrigidos na planilha → atualizados", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1000 }));
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ updatedAt: T2, value: 2500, saleDate: "2026-11-20T03:00:00.000Z" }),
      );

      const sale = await findSale();
      assert.equal(sale.value, 2500);
      assert.equal(sale.realizedAt.toISOString(), "2026-11-20T03:00:00.000Z");
    });

    it("Status \"Cancelada\" → venda cancelada (não apaga) e com os dados atualizados", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1000 }));
      const results = await sendAndGetResults(
        buildSheetRow({ updatedAt: T2, status: "Cancelada", value: 777 }),
      );

      const sale = await findSale();
      assert.equal(results[0].status, "cancelada");
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.value, 777);
    });

    it("status diferente de Concluída (ex.: em andamento) → cancelada", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Em andamento" }));

      assert.equal((await findSale()).dealStatus, "cancelada");
    });

    it("cancelada com dados faltando → só cancela, mantém os dados anteriores", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1000 }));
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ updatedAt: T2, status: "Cancelada", vendor: "", value: "" }),
      );

      const sale = await findSale();
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.value, 1000);
    });

    it("linha cancelada que nunca foi concluída → nada é criado", async () => {
      const results = await sendAndGetResults(buildSheetRow({ status: "Cancelada" }));

      assert.equal(results[0].status, "ignorada");
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("volta para Concluída → ativa de novo", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Cancelada" }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T3 }));

      assert.equal((await findSale()).dealStatus, "ativa");
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("envio antigo chegando atrasado → ignorado", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, value: 2000 }));
      const results = await sendAndGetResults(buildSheetRow({ updatedAt: T1, value: 5 }));

      assert.equal(results[0].status, "ignorada");
      assert.equal((await findSale()).value, 2000);
    });

    it("cancelamento atrasado depois de reativar → ignorado", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T3 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, status: "Cancelada" }));

      assert.equal((await findSale()).dealStatus, "ativa");
    });

    it("mesma data de envio (linhas do mesmo lote) → aplicado", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1000 }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, value: 1500 }));

      assert.equal((await findSale()).value, 1500);
    });

    it("troca de Setor e Classificação → segment e funnelType atualizados", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1 }));
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ updatedAt: T2, sector: "B2G", classification: "Renovação" }),
      );

      const sale = await findSale();
      assert.equal(sale.segment, "b2g");
      assert.equal(sale.funnelType, "farm");
    });
  });

  describe("passagens", () => {
    it("um nome → sdrIds com o _id dele", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "SDR B" }));

      assert.deepEqual((await findSale()).sdrIds.map(String), [seed.sdrB._id.toString()]);
    });

    it("várias pessoas separadas por vírgula → todas, na ordem da planilha", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "Suporte C, SDR B" }));

      assert.deepEqual((await findSale()).sdrIds.map(String), [
        seed.sdrC._id.toString(),
        seed.sdrB._id.toString(),
      ]);
    });

    it("vazio → sem passagem", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "" }));

      assert.deepEqual((await findSale()).sdrIds, []);
    });

    it("nome desconhecido no meio → só ele é descartado", async () => {
      await sendSheet(
        testApp.baseUrl,
        buildSheetRow({ passages: "SDR B, Pessoa Desconhecida, Suporte C" }),
      );

      assert.deepEqual((await findSale()).sdrIds.map(String), [
        seed.sdrB._id.toString(),
        seed.sdrC._id.toString(),
      ]);
    });

    it("pessoa tirada da passagem → sai da venda", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, passages: "SDR B, Suporte C" }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, passages: "SDR B" }));

      assert.deepEqual((await findSale()).sdrIds.map(String), [seed.sdrB._id.toString()]);
    });

    it("pessoas de times diferentes → cada time ganha os pontos da sua pessoa", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "SDR B, Suporte C" }));

      assert.equal((await getScoreboardTeam("Time A")).sales, TEST_POINTS.sales);
      assert.equal((await getScoreboardTeam("Time A")).passage, 0);
      assert.equal((await getScoreboardTeam("Time B")).passage, TEST_POINTS.passage);
      assert.equal((await getScoreboardTeam("Time C")).passage, TEST_POINTS.passage);
    });

    it("duas pessoas do mesmo time → o time ganha os pontos das duas", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ passages: "SDR B, CS B" }));

      assert.equal((await getScoreboardTeam("Time B")).passage, 2 * TEST_POINTS.passage);
    });

    it("venda cancelada → passagens não contam", async () => {
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T1, passages: "SDR B" }));
      await sendSheet(testApp.baseUrl, buildSheetRow({ updatedAt: T2, passages: "SDR B", status: "Cancelada" }));

      assert.equal((await getScoreboardTeam("Time B")).passage, 0);
    });
  });

  describe("índices únicos", () => {
    it("não deixa cadastrar dois vendors com o mesmo nome", async () => {
      await assert.rejects(
        Vendors.create({ rdUserId: "outro-id", vendorName: "Vendor A1", teamId: seed.teamA._id, job: "Executivo Venda" }),
        { code: 11000 },
      );
    });

    it("não deixa cadastrar dois SDRs com o mesmo nome", async () => {
      await assert.rejects(
        SDR.create({ name: "SDR B", teamId: seed.teamA._id, job: "sdr" }),
        { code: 11000 },
      );
    });
  });

  describe("rotas do admin (exigem login)", () => {
    // Token de admin igual ao que o login gera (assinado com o JWT_SECRET do .env)
    const adminHeaders = () => ({
      Authorization: `Bearer ${generateAccessToken({ id: "admin-teste", email: "admin@teste.com" })}`,
    });

    for (const path of ["/sales/admin", "/sales/get/6650f0f0f0f0f0f0f0f0f0f0"]) {
      it(`GET ${path} sem token → 401`, async () => {
        const res = await fetch(`${testApp.baseUrl}${path}`);

        assert.equal(res.status, 401);
      });

      it(`GET ${path} com token inválido → 401`, async () => {
        const res = await fetch(`${testApp.baseUrl}${path}`, {
          headers: { Authorization: "Bearer token-falso" },
        });

        assert.equal(res.status, 401);
      });

      it(`GET ${path} com token expirado → 401`, async () => {
        const jwt = require("jsonwebtoken");
        const expiredToken = jwt.sign({ userId: "admin-teste" }, process.env.JWT_SECRET, {
          expiresIn: -10,
        });

        const res = await fetch(`${testApp.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${expiredToken}` },
        });

        assert.equal(res.status, 401);
      });
    }

    it("GET /sales/admin com token → 200 com todas as vendas, inclusive canceladas", async () => {
      await sendSheet(testApp.baseUrl, [
        buildSheetRow({ id: "ativa", updatedAt: T1 }),
        buildSheetRow({ id: "cancelada", updatedAt: T1 }),
      ]);
      await sendSheet(testApp.baseUrl, buildSheetRow({ id: "cancelada", updatedAt: T2, status: "Cancelada" }));

      const res = await fetch(`${testApp.baseUrl}/sales/admin`, { headers: adminHeaders() });
      const body = await res.json();
      const statusBySale = Object.fromEntries(
        body.data.data.map((sale) => [sale.rdDealId, sale.dealStatus]),
      );

      assert.equal(res.status, 200);
      assert.deepEqual(statusBySale, { ativa: "ativa", cancelada: "cancelada" });
    });

    it("GET /sales/get/:vendorId com token → filtra pelo vendorId e traz o vendor populado", async () => {
      await sendSheet(testApp.baseUrl, [
        buildSheetRow({ id: "venda-a1" }),
        buildSheetRow({ id: "venda-b1", vendor: "Vendor B1" }),
      ]);

      const res = await fetch(`${testApp.baseUrl}/sales/get/${seed.vendorA1._id}`, {
        headers: adminHeaders(),
      });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.data.total, 1);
      assert.equal(body.data.data[0].rdDealId, "venda-a1");
      assert.equal(body.data.data[0].vendorId.vendorName, "Vendor A1");
    });

    it("rotas das telas continuam públicas (sem token)", async () => {
      for (const path of ["/sales/get", "/analytics/goal", "/analytics/scoreboard", "/analytics/ranking", "/analytics/sdr-ranking"]) {
        const res = await fetch(`${testApp.baseUrl}${path}`);
        assert.equal(res.status, 200, path);
      }
    });
  });

  describe("rotas removidas", () => {
    const removedRoutes = [
      ["POST", "/sales/webhook/deal"],
      ["POST", "/sales/create"],
      ["PATCH", "/sales/update/6650f0f0f0f0f0f0f0f0f0f0"],
      ["GET", "/auth/callback"],
    ];

    for (const [method, path] of removedRoutes) {
      it(`${method} ${path} → 404`, async () => {
        const res = await fetch(`${testApp.baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${generateAccessToken({ id: "admin-teste", email: "admin@teste.com" })}`,
            webhook_secret: process.env.WEBHOOK_SECRET,
          },
          body: method === "GET" ? undefined : JSON.stringify({ value: 10 }),
        });

        assert.equal(res.status, 404);
      });
    }
  });
});
