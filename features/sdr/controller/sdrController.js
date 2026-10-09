const SdrService = require("../service/sdrService");

exports.getAllSdrs = async (req, res, next) => {
  const sdrs = await SdrService.findAll();

  res.status(200).json({
    data: sdrs,
    message: "Sdr's recuperado com sucesso",
    success: true,
  });
};
