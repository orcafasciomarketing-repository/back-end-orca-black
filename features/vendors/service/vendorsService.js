const VendorsRepository = require("../repository/vendorsRepository");

exports.findAll = async () => {
  return await VendorsRepository.findAll();
};

exports.findById = async (id) => {
  return await VendorsRepository.findById(id);
};

exports.findByTeam = async (teamId) => {
  return await VendorsRepository.findByTeam(teamId);
};

exports.updateVendor = async (id, data) => {
  return await VendorsRepository.updateVendor(id, data);
};
