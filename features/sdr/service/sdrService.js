const SdrRepository = require("../repository/sdrRepository");

exports.findAll = async () => {
  return await SdrRepository.findAll();
};

exports.findById = async (id) => {
  return await SdrRepository.findById(id);
};

exports.findByTeam = async (teamId) => {
  return await SdrRepository.findByTeam(teamId);
};

exports.updateSdr = async (id, data) => {
  return await SdrRepository.updateSdr(id, data);
};
