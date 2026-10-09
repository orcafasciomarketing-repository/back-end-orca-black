const bcrypt = require("bcrypt");

const pepper = process.env.PEPPER;
const rounds = Number(process.env.ROUND_ENCRYPTION || 15);

exports.hashPassword = async (password) => {
  return await bcrypt.hash(password + pepper, rounds);
};

exports.comparePassword = async (password, passwordHash) => {
  return await bcrypt.compare(password + pepper, passwordHash);
};
