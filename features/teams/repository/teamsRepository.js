const Teams = require("../model/teamsModel");

exports.findAll = async () => {
  return await Teams.find({});
};

exports.findById = async (id) => {
  return await Teams.findById(id);
};
