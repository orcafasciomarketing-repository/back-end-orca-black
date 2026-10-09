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
