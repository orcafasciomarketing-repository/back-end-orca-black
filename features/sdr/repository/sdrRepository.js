const SDR = require("../model/sdrModel");

exports.findAll = async () => {
  return await SDR.find({});
};

exports.findById = async (id) => {
  return await SDR.findById(id);
};

exports.findByTeam = async (teamId) => {
  return await SDR.find({ teamId });
};

exports.updateSdr = async (id, data) => {
  return await SDR.findByIdAndUpdate(id, data, { new: true });
};
