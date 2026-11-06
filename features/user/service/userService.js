const { isValidObjectId } = require("mongoose");

const { ConflictError, NotFoundError, ValidationError } = require("../../../shared/errors");
const User = require("../repository/userRepository");
const { hashPassword } = require("../../security/service/passwordService");
const RefreshTokenService = require("../../token/service/tokenService");

exports.createUser = async ({ email, password, role }) => {
  const existingUser = await User.findUserByEmail(email);

  if (existingUser) {
    throw ConflictError();
  }

  const hashedPassword = await hashPassword(password);

  return await User.createUser({ email, passwordHash: hashedPassword, role });
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

exports.findAll = async () => {
  return await User.findAll();
};

const findExistingUser = async (id) => {
  const user = isValidObjectId(id) ? await User.findUserById(id) : null;
  if (!user) throw NotFoundError("Usuário não encontrado");
  return user;
};

// currentUserId: quem está fazendo a alteração. O admin não muda o próprio perfil
// nem se exclui, para nunca ficar sem nenhum admin
exports.updateUser = async (id, { role, password }, currentUserId) => {
  await findExistingUser(id);

  if (role !== undefined && id === currentUserId) {
    throw ValidationError("Você não pode alterar o seu próprio perfil");
  }

  const data = {};
  if (role !== undefined) data.role = role;
  if (password !== undefined) data.passwordHash = await hashPassword(password);

  const updatedUser = await User.updateUser(id, data);

  // Senha nova: derruba as sessões abertas, a pessoa entra de novo com a senha nova
  if (password !== undefined) await RefreshTokenService.revokeAllTokens(id);

  return updatedUser;
};

exports.deleteUser = async (id, currentUserId) => {
  await findExistingUser(id);

  if (id === currentUserId) {
    throw ValidationError("Você não pode excluir o seu próprio usuário");
  }

  await User.deleteUser(id);
  await RefreshTokenService.revokeAllTokens(id);
};
