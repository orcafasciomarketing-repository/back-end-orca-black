const TeamRepository = require("../repository/teamsRepository");

exports.findAll = async () => {
  return await TeamRepository.findAll();
};

exports.findById = async (id) => {
  return await TeamRepository.findById(id);
};
