const SalesService = require("../service/salesService");
const SalesImportService = require("../service/salesImportService");
const {
  isValidWebhookSecret,
} = require("../../../shared/webhookSecretService");

exports.getAllSales = async (req, res, next) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const sales = await SalesService.findAll(page, limit);
  return res.status(200).json({
    success: true,
    data: sales,
    message: "Vendas recuperadas com sucesso",
  });
};

exports.getWeekSales = async (req, res, next) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  const sales = await SalesService.findActiveByWeek(page, limit);
  return res.status(200).json({
    success: true,
    data: sales,
    message: "Vendas da semana recuperados com sucesso",
  });
};

exports.getSalesByVendor = async (req, res, next) => {
  const { vendorId } = req.params;

  const vendorSales = await SalesService.findByVendor(vendorId);
  return res.status(200).json({
    success: true,
    data: vendorSales,
    message: "Vendas recuperadas com sucesso",
  });
};

exports.sheetSaleEntry = async (req, res, next) => {
  // Aceita também "x-webhook-secret": alguns proxies descartam header com "_".
  // Nunca logar nem devolver os headers: eles carregam o segredo
  const receivedSecret =
    req.headers["webhook_secret"] ?? req.headers["x-webhook-secret"];
  const isValid = isValidWebhookSecret(receivedSecret);
  if (!isValid) {
    return res.status(401).json({ error: "Acesso negado" });
  }

  // O Apps Script manda uma lista de linhas; uma linha solta também é aceita
  const rows = Array.isArray(req.body) ? req.body : [req.body];

  const results = await SalesService.sheetSalesProcess(rows);
  return res.status(200).json({
    success: true,
    data: results,
    message: "Linhas da planilha processadas",
  });
};

// Importação pelo admin: o corpo é o texto do CSV (Content-Type text/csv)
exports.previewImport = async (req, res, next) => {
  const report = await SalesImportService.previewImport(req.body);
  return res.status(200).json({
    success: true,
    data: report,
    message: "Prévia da importação",
  });
};

exports.importSales = async (req, res, next) => {
  const { report, imported } = await SalesImportService.importSales(req.body);

  // Arquivo com erro: nada foi gravado e a importação anterior continua valendo
  if (!imported) {
    return res.status(400).json({
      success: false,
      data: report,
      error: "O arquivo tem erros, nada foi importado",
    });
  }

  return res.status(200).json({
    success: true,
    data: report,
    message: "Vendas importadas com sucesso",
  });
};
