const User = require("../model/userModel");

exports.createUser = async (userData) => {
  const user = await User.create(userData);
  user.passwordHash = undefined;
  return user;
};

exports.findUserByEmail = async (email) => {
  return await User.findOne({ email });
};

exports.findUserById = async (id) => {
  return await User.findById(id);
};

exports.findUserWithPassword = async (id) => {
  return await User.findById(id).select("+passwordHash");
};

// Sem lean: assim o default do perfil (admin) vale para os usuários antigos
exports.findAll = async () => {
  return await User.find({}).sort({ email: 1 });
};

exports.updateUser = async (id, data, unset = {}) => {
  const update = Object.keys(unset).length ? { $set: data, $unset: unset } : { $set: data };
  return await User.findByIdAndUpdate(id, update, { returnDocument: "after", runValidators: true });
};

// field: "vendorId" ou "sdrId"
exports.findUserByPerson = async (field, personId) => {
  return await User.findOne({ [field]: personId });
};

exports.deleteUser = async (id) => {
  return await User.findByIdAndDelete(id);
};
