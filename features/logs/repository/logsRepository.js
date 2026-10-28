const Logs = require("../model/logsModel");

exports.create = async (logData) => {
  return await Logs.create(logData);
};

exports.findLatest = async (limit) => {
  return await Logs.find({}).sort({ createdAt: -1 }).limit(limit);
};
