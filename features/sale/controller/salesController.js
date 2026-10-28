const SalesService = require("../service/salesService");
const { isValidWebhookSecret } = require("../../../shared/webhookSecretService");

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

exports.getSalesByVendor = async(req, res, next) =>{
  const {vendorId} = req.params;

  const vendorSales = await SalesService.findByVendor(vendorId);
  return res.status(200).json({
    success: true,
    data: vendorSales,
    message: "Vendas recuperadas com sucesso",
  })
}

exports.sheetSaleEntry = async (req, res, next) => {
  // O header traz o hash bcrypt de (segredo + pepper), não o segredo
  // Aceita também "x-webhook-secret": alguns proxies descartam header com "_"
  const receivedHash = req.headers["webhook_secret"] ?? req.headers["x-webhook-secret"];
  const isValid = await isValidWebhookSecret(receivedHash);
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
