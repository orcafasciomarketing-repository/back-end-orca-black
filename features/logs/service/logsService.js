const LogsRepository = require("../repository/logsRepository");

// O widget do admin mostra só os mais recentes
const LOGS_LIST_LIMIT = 200;

exports.create = async (logData) => {
  return await LogsRepository.create(logData);
};

exports.findLatest = async () => {
  return await LogsRepository.findLatest(LOGS_LIST_LIMIT);
};
