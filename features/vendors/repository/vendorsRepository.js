const Vendors = require("../model/vendorsModel");

exports.findAll = async () => {
  return await Vendors.find({});
};

exports.findById = async (id) => {
  return await Vendors.findById(id);
};

exports.findByName = async (vendorName) => {
  return await Vendors.findOne({ vendorName });
};

exports.findByTeam = async (teamId) => {
  return await Vendors.find({ teamId });
};

exports.updateVendor = async (id, data) => {
  return await Vendors.findByIdAndUpdate(id, data, { new: true });
};
