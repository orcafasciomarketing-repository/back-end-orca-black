const { isValidObjectId } = require("mongoose");

const { ConflictError, NotFoundError, ValidationError } = require("../../../shared/errors");
const User = require("../repository/userRepository");
const { hashPassword } = require("../../security/service/passwordService");
const RefreshTokenService = require("../../token/service/tokenService");
const { getUserRole, isMasterEmail } = require("../../../config/roles");

// Usuário como vai para o front: sem a senha e com o perfil que vale (o master vem como "master")
exports.toPublicUser = (user) => {
  const { passwordHash, ...data } = user.toJSON();
  return { ...data, role: getUserRole(user) };
};

// currentUserRole: perfil de quem cadastra. Só o master cadastra o e-mail do master
// (senão um admin criaria a conta com esse e-mail e viraria master)
exports.createUser = async ({ email, password, role }, currentUserRole) => {
  if (isMasterEmail(email) && currentUserRole !== "master") {
    throw ValidationError("Este e-mail é reservado");
  }

  const existingUser = await User.findUserByEmail(email);

  if (existingUser) {
    throw ConflictError();
  }

  const hashedPassword = await hashPassword(password);

  return exports.toPublicUser(await User.createUser({ email, passwordHash: hashedPassword, role }));
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
  const users = await User.findAll();
  return users.map(exports.toPublicUser);
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

  return exports.toPublicUser(updatedUser);
};

exports.deleteUser = async (id, currentUserId) => {
  await findExistingUser(id);

  if (id === currentUserId) {
    throw ValidationError("Você não pode excluir o seu próprio usuário");
  }

  await User.deleteUser(id);
  await RefreshTokenService.revokeAllTokens(id);
};
