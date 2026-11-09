const { isValidObjectId } = require("mongoose");

const { ConflictError, NotFoundError, ValidationError } = require("../../../shared/errors");
const User = require("../repository/userRepository");
const { hashPassword } = require("../../security/service/passwordService");
const RefreshTokenService = require("../../token/service/tokenService");
const VendorsService = require("../../vendors/service/vendorsService");
const SdrService = require("../../sdr/service/sdrService");
const { PERSON_ROLES, getUserRole, isMasterEmail } = require("../../../config/roles");

const PERSON_FINDERS = { vendorId: VendorsService.findById, sdrId: SdrService.findById };

// Perfil de colaborador: confere se a pessoa existe e se ainda não tem outra conta.
// Devolve os campos de ligação para gravar ({ vendorId } ou { sdrId }); outros perfis, nenhum
const resolvePersonLink = async (role, ids, ignoreUserId = null) => {
  const field = PERSON_ROLES[role];
  if (!field) return {};

  const person = await PERSON_FINDERS[field](ids[field]);
  if (!person) throw ValidationError("Pessoa não encontrada");

  const linkedUser = await User.findUserByPerson(field, ids[field]);
  if (linkedUser && linkedUser._id.toString() !== ignoreUserId) {
    throw ConflictError("Essa pessoa já tem uma conta");
  }

  return { [field]: ids[field] };
};

// Usuário como vai para o front: sem a senha e com o perfil que vale (o master vem como "master")
exports.toPublicUser = (user) => {
  const { passwordHash, ...data } = user.toJSON();
  return { ...data, role: getUserRole(user) };
};

// currentUserRole: perfil de quem cadastra. Só o master cadastra o e-mail do master
// (senão um admin criaria a conta com esse e-mail e viraria master)
exports.createUser = async ({ email, password, role, vendorId, sdrId }, currentUserRole) => {
  if (isMasterEmail(email) && currentUserRole !== "master") {
    throw ValidationError("Este e-mail é reservado");
  }

  const existingUser = await User.findUserByEmail(email);

  if (existingUser) {
    throw ConflictError();
  }

  const personLink = await resolvePersonLink(role, { vendorId, sdrId });
  const hashedPassword = await hashPassword(password);

  return exports.toPublicUser(await User.createUser({ email, passwordHash: hashedPassword, role, ...personLink }));
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
exports.updateUser = async (id, { role, password, vendorId, sdrId }, currentUserId) => {
  await findExistingUser(id);

  if (role !== undefined && id === currentUserId) {
    throw ValidationError("Você não pode alterar o seu próprio perfil");
  }

  const data = {};
  const unset = {};
  if (role !== undefined) {
    data.role = role;
    // Trocar o perfil troca (ou tira) a pessoa ligada à conta
    const personLink = await resolvePersonLink(role, { vendorId, sdrId }, id);
    Object.assign(data, personLink);
    for (const field of Object.values(PERSON_ROLES)) {
      if (!(field in personLink)) unset[field] = "";
    }
  }
  if (password !== undefined) data.passwordHash = await hashPassword(password);

  const updatedUser = await User.updateUser(id, data, unset);

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

// Troca da própria senha (POST /auth/change-password): grava e derruba todas as sessões abertas
exports.changeOwnPassword = async (id, password) => {
  await User.updateUser(id, { passwordHash: await hashPassword(password) });
  await RefreshTokenService.revokeAllTokens(id);
};
