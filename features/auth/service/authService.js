const UserService = require("../../user/service/userService");
const AccessTokenService = require("../../../shared/accessTokenService");
const RefreshTokenService = require("../../token/service/tokenService");
const passwordService = require("../../security/service/passwordService");
const { NotFoundError, UnauthorizedError, ValidationError } = require("../../../shared/errors");

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
