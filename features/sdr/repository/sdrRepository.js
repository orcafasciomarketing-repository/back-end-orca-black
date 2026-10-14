const SDR = require("../model/sdrModel");

exports.findAll = async () => {
  return await SDR.find({});
};

exports.findById = async (id) => {
  return await SDR.findById(id);
};

exports.findByName = async (name) => {
  return await SDR.findOne({ name });
};

exports.findByTeam = async (teamId) => {
  return await SDR.find({ teamId });
};

exports.updateSdr = async (id, data) => {
  return await SDR.findByIdAndUpdate(id, data, { new: true });
};
