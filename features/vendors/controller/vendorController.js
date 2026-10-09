const VendorsService = require("../service/vendorsService");

exports.getAllVendors = async (req, res, next) => {
  const vendors = await VendorsService.findAll();

  res.status(200).json({
    data: vendors,
    success: true,
    message: "Vendedores recuperados com sucesso",
  });
};
