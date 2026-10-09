const UserService = require("../../user/service/userService");
const AccessTokenService = require("../../../shared/accessTokenService");
const RefreshTokenService = require("../../token/service/tokenService");
const passwordService = require("../../security/service/passwordService");
const { NotFoundError, UnauthorizedError } = require("../../../shared/errors");

exports.registerUser = async (userData) => {
  const createdUser = await UserService.createUser(userData);

  const accessToken = AccessTokenService.generateAccessToken({ id: createdUser._id, email: createdUser.email });
  const refreshToken = await RefreshTokenService.createToken(createdUser._id);

  return {
    user: createdUser,
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

  await RefreshTokenService.revokeAllTokens(user._id);

  const accessToken = AccessTokenService.generateAccessToken({ id: user._id, email: user.email });
  const refreshToken = await RefreshTokenService.createToken(user._id);

  return {
    user,
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
    user: user,
  };
};
