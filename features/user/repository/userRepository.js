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

exports.updateUser = async (id, data) => {
  return await User.findByIdAndUpdate(id, { $set: data }, { returnDocument: "after", runValidators: true });
};

exports.deleteUser = async (id) => {
  return await User.findByIdAndDelete(id);
};
