const { describe, it, before, after, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
  startTestApp,
  seedBase,
  clearDatabase,
  buildRdPayload,
  sendWebhook,
  TEST_STAGES,
} = require("./helpers/testApp");

const Sales = require("../features/sale/model/salesModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const SDR = require("../features/sdr/model/sdrModel");
const { generateAccessToken } = require("../shared/accessTokenService");

describe("Webhook da RD (POST /sales/webhook/deal)", () => {
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

  describe("secret do header webhook_secret", () => {
    it("sem o .env carregado o teste não faz sentido: WEBHOOK_SECRET precisa existir", () => {
      assert.ok(process.env.WEBHOOK_SECRET, "WEBHOOK_SECRET não está no .env");
    });

    it("secret errado → 401 e nada é salvo", async () => {
      const res = await sendWebhook(testApp.baseUrl, buildRdPayload(), "secret-errado");

      assert.equal(res.status, 401);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("sem o header → 401 e nada é salvo", async () => {
      const res = await sendWebhook(testApp.baseUrl, buildRdPayload(), null);

      assert.equal(res.status, 401);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("a resposta de 401 não devolve o secret", async () => {
      const res = await sendWebhook(testApp.baseUrl, buildRdPayload(), "secret-errado");
      const body = await res.text();

      assert.equal(body.includes(process.env.WEBHOOK_SECRET), false);
    });

    it("secret certo (do .env) → 200", async () => {
      const res = await sendWebhook(testApp.baseUrl, buildRdPayload());

      assert.equal(res.status, 200);
    });
  });

  describe("o que é venda (etapa Blackfriday + status won)", () => {
    it("deal na etapa Blackfriday e won → venda criada como ativa", async () => {
      const payload = buildRdPayload({ amount: 1500 });

      const res = await sendWebhook(testApp.baseUrl, payload);
      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });

      assert.equal(res.status, 200);
      assert.ok(sale);
      assert.equal(sale.dealStatus, "ativa");
      assert.equal(sale.value, 1500);
      assert.equal(sale.segment, "b2b");
      assert.equal(sale.funnelType, "sales");
      assert.equal(sale.vendorId.toString(), seed.vendorA1._id.toString());
      assert.equal(sale.realizedAt.toISOString(), payload.document.updated_at);
      assert.equal(sale.rdUpdatedAt.toISOString(), payload.document.updated_at);
    });

    it("rdDealStatus não é mais salvo na venda", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload());
      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" }).lean();

      assert.equal("rdDealStatus" in sale, false);
    });

    it("deal na etapa Blackfriday mas ainda não won → 200 e nada é salvo", async () => {
      const res = await sendWebhook(testApp.baseUrl, buildRdPayload({ status: "ongoing" }));

      assert.equal(res.status, 200);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("deal won fora das etapas Blackfriday → 200 e nada é salvo", async () => {
      const res = await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ stageId: TEST_STAGES.OUTSIDE }),
      );

      assert.equal(res.status, 200);
      assert.equal(await Sales.countDocuments(), 0);
    });

    it("cada uma das quatro etapas gera o segment/funnelType certo", async () => {
      const cases = [
        { stageId: TEST_STAGES.B2B_SALES, segment: "b2b", funnelType: "sales" },
        { stageId: TEST_STAGES.B2B_FARM, segment: "b2b", funnelType: "farm" },
        { stageId: TEST_STAGES.B2G_SALES, segment: "b2g", funnelType: "sales" },
        { stageId: TEST_STAGES.B2G_FARM, segment: "b2g", funnelType: "farm" },
      ];

      for (const [index, testCase] of cases.entries()) {
        await sendWebhook(
          testApp.baseUrl,
          buildRdPayload({ dealId: `deal-${index}`, stageId: testCase.stageId }),
        );
        const sale = await Sales.findOne({ rdDealId: `deal-${index}` });

        assert.equal(sale.segment, testCase.segment);
        assert.equal(sale.funnelType, testCase.funnelType);
      }
    });

    it("dono do deal não cadastrado como vendor → nada salvo e console.warn com rdUserId e rdDealId", async () => {
      const warnMock = mock.method(console, "warn", () => {});

      const res = await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ rdUserId: "rd-user-inexistente" }),
      );

      assert.equal(res.status, 200);
      assert.equal(await Sales.countDocuments(), 0);
      assert.equal(warnMock.mock.callCount(), 1);
      const message = warnMock.mock.calls[0].arguments[0];
      assert.ok(message.includes("rd-user-inexistente"));
      assert.ok(message.includes("rd-deal-1"));
      warnMock.mock.restore();
    });
  });

  describe("ciclo de vida da venda (tabela 5.5 do projeto.md)", () => {
    const T1 = "2026-11-27T13:00:00.100Z";
    const T2 = "2026-11-27T13:05:00.200Z";
    const T3 = "2026-11-27T13:10:00.300Z";
    const T4 = "2026-11-27T13:15:00.400Z";

    // Só os dados que vêm da RD (o updatedAt do Mongoose muda ao reaplicar o evento)
    const pickSaleData = ({ rdDealId, rdDealName, value, vendorId, sdrId, segment, funnelType, rdUpdatedAt, realizedAt, dealStatus }) =>
      ({ rdDealId, rdDealName, value, vendorId, sdrId, segment, funnelType, rdUpdatedAt, realizedAt, dealStatus });

    it("mesmo evento reenviado → não duplica e os dados continuam iguais", async () => {
      const payload = buildRdPayload({ updatedAt: T1 });

      await sendWebhook(testApp.baseUrl, payload);
      const before = await Sales.findOne({ rdDealId: "rd-deal-1" }).lean();
      const res = await sendWebhook(testApp.baseUrl, payload);
      const afterResend = await Sales.findOne({ rdDealId: "rd-deal-1" }).lean();

      assert.equal(res.status, 200);
      assert.equal(await Sales.countDocuments(), 1);
      assert.deepEqual(pickSaleData(afterResend), pickSaleData(before));
    });

    it("edição só do custom field (RD não muda o updated_at) → passagem atualizada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, passageName: "SDR B" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, passageName: "Suporte C" }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.sdrId.toString(), seed.sdrC._id.toString());
    });

    it("passagem removida sem mudar o updated_at → sdrId removido", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, passageName: "SDR B" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" }).lean();
      assert.equal("sdrId" in sale, false);
    });

    it("qualquer dado alterado com o mesmo updated_at → atualizado (realizedAt igual)", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T1, amount: 2500, dealName: "Nome corrigido" }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.value, 2500);
      assert.equal(sale.rdDealName, "Nome corrigido");
      assert.equal(sale.realizedAt.toISOString(), T1);
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("cancelamento com o mesmo updated_at → cancelada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, status: "lost" }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
    });

    it("mesmo evento chegando várias vezes ao mesmo tempo → uma venda só, todas respostas 200", async () => {
      const payload = buildRdPayload({ updatedAt: T1 });

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => sendWebhook(testApp.baseUrl, payload)),
      );

      assert.deepEqual(responses.map((res) => res.status), [200, 200, 200, 200, 200]);
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("valor corrigido na RD → value atualizado e realizedAt igual", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, amount: 1200 }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.value, 1200);
      assert.equal(sale.realizedAt.toISOString(), T1);
      assert.equal(sale.rdUpdatedAt.toISOString(), T2);
    });

    it("deal sai da etapa → cancelada (não apaga)", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T2, stageId: TEST_STAGES.OUTSIDE }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
    });

    for (const status of ["lost", "ongoing", "paused"]) {
      it(`deal continua na etapa mas fica ${status} → cancelada`, async () => {
        await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
        await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status }));

        const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
        assert.equal(sale.dealStatus, "cancelada");
      });
    }

    it("venda cancelada (perdida) ainda na etapa e editada → dados atualizados, continua cancelada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost" }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({
          updatedAt: T3,
          status: "lost",
          amount: 777,
          dealName: "Nome editado",
          passageName: "SDR B",
        }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.value, 777);
      assert.equal(sale.rdDealName, "Nome editado");
      assert.equal(sale.sdrId.toString(), seed.sdrB._id.toString());
      assert.equal(sale.realizedAt.toISOString(), T1);
    });

    it("venda cancelada: edição só do custom field (mesmo updated_at) → passagem atualizada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost", passageName: "SDR B" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost", passageName: "Suporte C" }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.sdrId.toString(), seed.sdrC._id.toString());
    });

    it("venda cancelada trocada de funil dentro das etapas Blackfriday → segment/funnelType atualizados", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T2, status: "lost", stageId: TEST_STAGES.B2G_FARM }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.segment, "b2g");
      assert.equal(sale.funnelType, "farm");
    });

    it("venda cancelada: evento antigo na etapa → nada muda", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T3, status: "lost", amount: 1000 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost", amount: 5555 }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.value, 1000);
      assert.equal(sale.rdUpdatedAt.toISOString(), T3);
    });

    it("deal fora da etapa → só cancela, os dados não mudam", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, amount: 1000 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T2, stageId: TEST_STAGES.OUTSIDE, amount: 9 }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.value, 1000);
      assert.equal(sale.segment, "b2b");
    });

    it("deal nunca ganho editado várias vezes na etapa → nenhuma venda criada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, status: "ongoing" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "ongoing", amount: 50 }));

      assert.equal(await Sales.countDocuments(), 0);
    });

    it("evento antigo chegando depois do cancelamento → nada muda", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T3, status: "lost" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, amount: 9999 }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "cancelada");
      assert.equal(sale.value, 1000);
      assert.equal(sale.rdUpdatedAt.toISOString(), T3);
    });

    it("deal volta a ser won na etapa → ativa de novo, realizedAt igual", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, status: "lost" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T3 }));

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.dealStatus, "ativa");
      assert.equal(sale.realizedAt.toISOString(), T1);
      assert.equal(await Sales.countDocuments(), 1);
    });

    it("deal vai para a etapa Blackfriday de outro funil → segment/funnelType atualizados", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1 }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ updatedAt: T4, stageId: TEST_STAGES.B2G_FARM }),
      );

      const sale = await Sales.findOne({ rdDealId: "rd-deal-1" });
      assert.equal(sale.segment, "b2g");
      assert.equal(sale.funnelType, "farm");
      assert.equal(sale.realizedAt.toISOString(), T1);
    });
  });

  describe("passagem (custom field com o nome do SDR)", () => {
    const T1 = "2026-11-27T13:00:00.100Z";
    const T2 = "2026-11-27T13:05:00.200Z";

    const findSale = async () => await Sales.findOne({ rdDealId: "rd-deal-1" }).lean();

    it("nome de um SDR cadastrado → sdrId é o _id dele no banco", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ passageName: "SDR B" }));

      const sale = await findSale();
      assert.equal(sale.sdrId.toString(), seed.sdrB._id.toString());
    });

    it("passagem feita por Suporte/CS também é vinculada", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ passageName: "Suporte C" }));

      const sale = await findSale();
      assert.equal(sale.sdrId.toString(), seed.sdrC._id.toString());
    });

    it("campo vazio (value null) → venda salva sem a propriedade sdrId", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload());

      const sale = await findSale();
      assert.ok(sale);
      assert.equal("sdrId" in sale, false);
    });

    it("campo ausente do payload → venda salva sem a propriedade sdrId", async () => {
      const payload = buildRdPayload();
      delete payload.document.deal_custom_fields;

      await sendWebhook(testApp.baseUrl, payload);

      const sale = await findSale();
      assert.ok(sale);
      assert.equal("sdrId" in sale, false);
    });

    it("nome que não está no cadastro → passagem descartada, venda salva sem sdrId", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ passageName: "Pessoa Desconhecida" }));

      const sale = await findSale();
      assert.ok(sale);
      assert.equal(sale.dealStatus, "ativa");
      assert.equal("sdrId" in sale, false);
    });

    it("passagem removida do deal na RD → próximo evento remove o sdrId", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, passageName: "SDR B" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2 }));

      const sale = await findSale();
      assert.equal("sdrId" in sale, false);
    });

    it("passagem trocada por outra pessoa → sdrId atualizado", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T1, passageName: "SDR B" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ updatedAt: T2, passageName: "Suporte C" }));

      const sale = await findSale();
      assert.equal(sale.sdrId.toString(), seed.sdrC._id.toString());
    });

    it("passagem chega no placar: pontos vão para o time de quem fez a passagem", async () => {
      // vendor A1 (time A) vende, SDR B (time B) fez a passagem
      await sendWebhook(testApp.baseUrl, buildRdPayload({ passageName: "SDR B" }));

      const res = await fetch(`${testApp.baseUrl}/analytics/scoreboard`);
      const { data } = await res.json();
      const teamA = data.find((team) => team.teamName === "Time A");
      const teamB = data.find((team) => team.teamName === "Time B");

      assert.equal(teamA.sales, 3);
      assert.equal(teamA.passage, 0);
      assert.equal(teamB.passage, 1);
    });

    it("não deixa cadastrar dois SDRs com o mesmo nome", async () => {
      await assert.rejects(
        SDR.create({ name: "SDR B", teamId: seed.teamA._id, job: "sdr" }),
        { code: 11000 },
      );
    });
  });

  describe("índice único do vendor (rdUserId)", () => {
    it("não deixa cadastrar dois vendors com o mesmo id da RD", async () => {
      await assert.rejects(
        Vendors.create({
          rdUserId: "rd-user-a1",
          vendorName: "Duplicado",
          teamId: seed.teamA._id,
          job: "Executivo Venda",
        }),
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

      it(`GET ${path} com token expirado → 401 (antes dava 500)`, async () => {
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
      await sendWebhook(testApp.baseUrl, buildRdPayload({ dealId: "deal-ativa" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ dealId: "deal-cancelada", status: "lost" }));
      await sendWebhook(testApp.baseUrl, buildRdPayload({ dealId: "deal-cancelada-2" }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ dealId: "deal-cancelada-2", status: "lost", updatedAt: "2026-11-28T10:00:00.000Z" }),
      );

      const res = await fetch(`${testApp.baseUrl}/sales/admin`, { headers: adminHeaders() });
      const body = await res.json();
      const statusByDeal = Object.fromEntries(
        body.data.data.map((sale) => [sale.rdDealId, sale.dealStatus]),
      );

      assert.equal(res.status, 200);
      assert.deepEqual(statusByDeal, { "deal-ativa": "ativa", "deal-cancelada-2": "cancelada" });
    });

    it("GET /sales/get/:vendorId com token → filtra pelo vendorId e traz o vendor populado", async () => {
      await sendWebhook(testApp.baseUrl, buildRdPayload({ dealId: "deal-a1" }));
      await sendWebhook(
        testApp.baseUrl,
        buildRdPayload({ dealId: "deal-b1", rdUserId: "rd-user-b1" }),
      );

      const res = await fetch(`${testApp.baseUrl}/sales/get/${seed.vendorA1._id}`, {
        headers: adminHeaders(),
      });
      const body = await res.json();

      assert.equal(res.status, 200);
      assert.equal(body.data.total, 1);
      assert.equal(body.data.data[0].rdDealId, "deal-a1");
      assert.equal(body.data.data[0].vendorId.vendorName, "Vendor A1");
    });

    it("rotas das telas continuam públicas (sem token)", async () => {
      for (const path of ["/sales/get", "/analytics/goal", "/analytics/scoreboard", "/analytics/ranking", "/analytics/sdr-ranking"]) {
        const res = await fetch(`${testApp.baseUrl}${path}`);
        assert.equal(res.status, 200, path);
      }
    });
  });

  describe("rotas removidas (a RD é a fonte da verdade)", () => {
    const removedRoutes = [
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
          },
          body: method === "GET" ? undefined : JSON.stringify({ value: 10 }),
        });

        assert.equal(res.status, 404);
      });
    }
  });
});
