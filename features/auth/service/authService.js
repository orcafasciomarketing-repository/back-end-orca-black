const UserService = require("../../user/service/userService");
const AccessTokenService = require("../../../shared/accessTokenService");
const RefreshTokenService = require("../../token/service/tokenService");
const passwordService = require("../../security/service/passwordService");
const { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } = require("../../../shared/errors");
const { isPersonRole } = require("../../../config/roles");
const { isValidObjectId } = require("mongoose");

// Sem cookie ou com token que já não vale: não faz nada (sair sempre dá certo)
exports.logoutUser = async (refreshToken) => {
  if (!refreshToken) return;
  await RefreshTokenService.revokeToken(refreshToken);
};

// Confere a senha atual, grava a nova, derruba as outras sessões e abre uma sessão nova para quem trocou
exports.changePassword = async (userId, { currentPassword, password }) => {
  const userWithPassword = await UserService.findUserWithPassword(userId);
  if (!userWithPassword) throw NotFoundError();

  const isPasswordValid = await passwordService.comparePassword(currentPassword, userWithPassword.passwordHash);
  if (!isPasswordValid) throw ValidationError("Senha atual incorreta");

  await UserService.changeOwnPassword(userId, password);

  const user = await UserService.findUserById(userId);
  const accessToken = AccessTokenService.generateAccessToken({ id: user._id, email: user.email });
  const refreshToken = await RefreshTokenService.createToken(user._id);

  return {
    user: UserService.toPublicUser(user),
    token: accessToken,
    refreshToken: refreshToken.token,
    expiration: refreshToken.expiresAt,
  };
};

exports.loginUser = async (userData) => {
  const { email, password } = userData;

  const user = await UserService.findUserByEmail(email);

  if (!user) {
    throw UnauthorizedError();
  }

  const userWithPassword = await UserService.findUserWithPassword(user._id);

  const isPasswordValid = await passwordService.comparePassword(password, userWithPassword.passwordHash);

  if (!isPasswordValid) {
    throw UnauthorizedError();
  }

  // Senha gravada com o custo antigo (lento): regrava com o atual, para os próximos logins serem rápidos.
  // Se não conseguir gravar, o login continua (tenta de novo no próximo)
  if (passwordService.needsRehash(userWithPassword.passwordHash)) {
    try {
      await UserService.rehashPassword(user._id, password);
    } catch (error) {
      console.error("Não foi possível regravar a senha com o custo novo", error);
    }
  }

  // Cada login é uma sessão nova; as outras sessões da conta (outro aparelho, outra pessoa) continuam
  const accessToken = AccessTokenService.generateAccessToken({ id: user._id, email: user.email });
  const refreshToken = await RefreshTokenService.createToken(user._id);

  return {
    user: UserService.toPublicUser(user),
    token: accessToken,
    refreshToken: refreshToken.token,
    expiration: refreshToken.expiresAt,
  };
};

// "Acessar como": o master recebe um access token da conta do colaborador (vendedor ou passagem), marcado com
// o id dele. Não cria sessão nem mexe no cookie do master: voltar é só usar a sessão dele de novo
exports.impersonate = async (master, targetId) => {
  if (master.impersonatedBy) throw ForbiddenError("Volte para a sua conta antes de acessar como outra pessoa");
  const target = isValidObjectId(targetId) ? await UserService.findUserById(targetId) : null;
  if (!target) throw NotFoundError("Usuário não encontrado");
  if (!isPersonRole(target.role)) throw ValidationError("Só dá para acessar como vendedor ou passagem");

  return {
    user: UserService.toPublicUser(target),
    token: AccessTokenService.generateAccessToken({ id: target._id, email: target.email, impersonatedBy: master.id }),
  };
};

exports.refreshUserTokens = async (oldRefreshToken) => {
  const { newToken, userId } = await RefreshTokenService.rotateToken(oldRefreshToken);

  const user = await UserService.findUserById(userId);

  if (!user) {
    throw NotFoundError();
  }

  const accessToken = AccessTokenService.generateAccessToken({ id: user._id, email: user.email });

  return {
    token: accessToken,
    refreshToken: newToken.token,
    expiration: newToken.expiresAt,
    user: UserService.toPublicUser(user),
  };
};
