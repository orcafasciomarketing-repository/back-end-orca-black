const { randomUUID } = require("node:crypto");

const SalesRepository = require("../repository/salesRepository");
const VendorRepository = require("../../vendors/repository/vendorsRepository");
const SdrRepository = require("../../sdr/repository/sdrRepository");
const { broadcast } = require("../../../shared/sseManager");
const { ValidationError, ConflictError } = require("../../../shared/errors");
const {
  translateSheetRow,
  findSaleDataErrors,
} = require("../adapters/sheetRowAdapter");
const { parseCsv, toSheetRow } = require("../adapters/csvImportAdapter");

// Importação pelo admin: o arquivo é a lista completa das vendas importadas.
// Cada importação substitui a anterior (corrigir ou remover = mudar o arquivo e importar de novo).
// Usa as mesmas regras da planilha, mas o vendedor é opcional: venda sem vendedor só conta na meta.

const REQUIRED_COLUMNS = ["Setor", "Valor da venda", "Data da venda"];

// Mesmo aviso da planilha: as telas buscam os dados de novo, sem popup.
// A importação reenvia todas as vendas, o popup apareceria de novo toda vez
const SALE_UPDATED_EVENT = { type: "sale-updated" };

// Dia da venda no horário de São Paulo, para comparar com as vendas da planilha
const toSaoPauloDay = (date) =>
  new Date(new Date(date).getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

// Mesma venda na planilha: mesmo "Id da venda" (arquivo exportado da planilha)
// ou mesma empresa, valor e dia
const findSheetDuplicate = (sheetSales, row, sale) =>
  sheetSales.find((sheetSale) => {
    if (row["Id da venda"] && sheetSale.rdDealId === row["Id da venda"]) return true;
    return (
      !!sale.rdDealName &&
      sheetSale.rdDealName === sale.rdDealName &&
      sheetSale.value === sale.value &&
      toSaoPauloDay(sheetSale.realizedAt) === toSaoPauloDay(sale.realizedAt)
    );
  });

const sumValues = (sales) => sales.reduce((total, sale) => total + sale.value, 0);

// Lê o arquivo e separa o que entra, os erros (impedem a importação) e os avisos (não impedem)
const buildImport = async (csvText) => {
  const { headers, rows } = parseCsv(csvText);

  const missingColumns = REQUIRED_COLUMNS.filter((name) => !headers.includes(name));
  if (missingColumns.length > 0) {
    const names = missingColumns.map((name) => `"${name}"`).join(", ");
    return {
      sales: [],
      errors: [{ linha: 1, mensagem: `Coluna não encontrada: ${names}` }],
      warnings: [],
      duplicates: [],
      ignored: [],
    };
  }

  const [vendors, sdrs, sheetSales] = await Promise.all([
    VendorRepository.findAll(),
    SdrRepository.findAll(),
    SalesRepository.findSheetSalesForDuplicates(),
  ]);
  const vendorByName = new Map(vendors.map((vendor) => [vendor.vendorName, vendor]));
  const sdrByName = new Map(sdrs.map((sdr) => [sdr.name, sdr]));

  const hasStatusColumn = headers.includes("Status");
  const now = new Date();
  const result = { sales: [], errors: [], warnings: [], duplicates: [], ignored: [] };

  for (const row of rows) {
    const sale = translateSheetRow(toSheetRow(row, hasStatusColumn));
    const linha = row.linha;

    // Mesma regra da planilha: só "Concluída" conta
    if (!sale.isConcluded) {
      result.ignored.push({ linha, mensagem: "Status diferente de Concluída" });
      continue;
    }

    const errors = findSaleDataErrors(sale, { requireVendor: false });
    const vendor = sale.vendorName ? vendorByName.get(sale.vendorName) : null;
    if (sale.vendorName && !vendor) {
      errors.push(`Vendedor "${sale.vendorName}" não cadastrado`);
    }
    if (!sale.vendorName && sale.rdPassageNames.length > 0) {
      errors.push("Venda sem vendedor não pode ter passagem");
    }
    if (errors.length > 0) {
      result.errors.push({ linha, mensagem: errors.join("; ") });
      continue;
    }

    // Igual à planilha: nome fora do cadastro é descartado. Aqui avisa, para corrigir antes
    const passageSdrs = sale.rdPassageNames.map((name) => sdrByName.get(name));
    const unknownNames = sale.rdPassageNames.filter((name, i) => !passageSdrs[i]);
    if (unknownNames.length > 0) {
      const names = unknownNames.map((name) => `"${name}"`).join(", ");
      result.warnings.push({ linha, mensagem: `Passagem não cadastrada (descartada): ${names}` });
    }

    const duplicate = findSheetDuplicate(sheetSales, row, sale);
    if (duplicate) {
      result.duplicates.push({
        linha,
        mensagem: `Parece já existir na planilha (${duplicate.rdDealName || duplicate.rdDealId})`,
      });
    }

    result.sales.push({
      // Id próprio: nunca colide com o "Id da venda" da planilha
      rdDealId: `importacao:${randomUUID()}`,
      rdDealName: sale.rdDealName,
      rdUpdatedAt: now,
      realizedAt: sale.realizedAt,
      value: sale.value,
      vendorId: vendor?._id ?? null,
      sdrIds: passageSdrs.filter(Boolean).map((sdr) => sdr._id),
      segment: sale.segment,
      funnelType: sale.funnelType,
      dealStatus: "ativa",
      source: "importacao",
    });
  }

  return result;
};

// Resumo que a tela mostra antes de confirmar (e depois de importar)
const buildReport = async ({ sales, errors, warnings, duplicates, ignored }) => ({
  current: await SalesRepository.summarizeImported(),
  file: {
    count: sales.length,
    total: sumValues(sales),
    withVendor: sales.filter((sale) => sale.vendorId).length,
    withoutVendor: sales.filter((sale) => !sale.vendorId).length,
  },
  errors,
  warnings,
  duplicates,
  ignored,
});

const assertHasContent = (csvText) => {
  if (!String(csvText ?? "").trim()) throw ValidationError("Arquivo vazio");
};

exports.previewImport = async (csvText) => {
  assertHasContent(csvText);
  return await buildReport(await buildImport(csvText));
};

// Duas importações ao mesmo tempo (ex.: clique duplo) apagariam o lote uma da outra
let isImporting = false;

// Devolve { report, imported }. Com erro no arquivo, não grava nada (imported: false)
// e as vendas da importação anterior continuam valendo
exports.importSales = async (csvText) => {
  assertHasContent(csvText);
  if (isImporting) throw ConflictError("Já existe uma importação em andamento");

  isImporting = true;
  try {
    const result = await buildImport(csvText);

    if (result.errors.length > 0) {
      return { report: await buildReport(result), imported: false };
    }
    if (result.sales.length === 0) {
      throw ValidationError("Nenhuma venda para importar no arquivo");
    }

    // Primeiro grava o lote novo, depois apaga os anteriores:
    // se a gravação falhar no meio, as vendas antigas não somem
    const importId = randomUUID();
    try {
      await SalesRepository.insertImported(
        result.sales.map((sale) => ({ ...sale, importId })),
      );
    } catch (err) {
      // Desfaz o que entrou do lote novo, senão contaria junto com o anterior
      await SalesRepository.deleteImportBatch(importId);
      throw err;
    }
    await SalesRepository.deleteImportedExcept(importId);

    broadcast(SALE_UPDATED_EVENT);

    return { report: await buildReport(result), imported: true };
  } finally {
    isImporting = false;
  }
};
