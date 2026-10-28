const LogsService = require("../service/logsService");

exports.createLog = async (req, res, next) => {
  const logData = req.data;

  await LogsService.create(logData);
  return res.status(201).json({
    success: true,
    message: "Log registrado com sucesso",
  });
};

exports.getLogs = async (req, res, next) => {
  const logs = await LogsService.findLatest();
  return res.status(200).json({
    success: true,
    data: logs,
    message: "Logs recuperados com sucesso",
  });
};
