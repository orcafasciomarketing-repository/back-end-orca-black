const { ConflictError } = require("../../../shared/errors");
const User = require("../repository/userRepository");
const { hashPassword } = require("../../security/service/passwordService");

exports.createUser = async ({ email, password }) => {
  const existingUser = await User.findUserByEmail(email);

  if (existingUser) {
    throw ConflictError();
  }

  const hashedPassword = await hashPassword(password);

  return await User.createUser({ email, passwordHash: hashedPassword });
};

exports.findUserByEmail = async (email) => {
  return await User.findUserByEmail(email);
};

exports.findUserById = async (id) => {
  return await User.findUserById(id);
};

exports.findUserWithPassword = async (id) => {
  return await User.findUserWithPassword(id);
};
