const SalesService = require("../service/salesService");

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

exports.webhookSaleEntry = async (req, res, next) =>{

  const secretToken = req.headers["webhook_secret"];
  if(secretToken !== process.env.WEBHOOK_SECRET){
    return res.status(401).json({error: "Venda não veio do webhook da RD, portanto não entrará no banco"})
  }

  await SalesService.rdDealEventProcess(req.body);

  res.status(200).json({received: true});

}
