const crypto = require("crypto");

const Token = require("../repository/tokenRepository");
const { TokenExpiredError, NotFoundError } = require("../../../shared/errors");

function createTokenString() {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString("hex");
}

async function saveToken(tokenObject) {
  const savedToken = await Token.save(tokenObject);
  return { token: savedToken.token, expiresAt: savedToken.expiresAt };
}

function generateTokenObject({ userId, expiresAt }) {
  const token = createTokenString();
  return {
    userId,
    token,
    expiresAt: expiresAt !== undefined ? expiresAt : Date.now() + parseInt(process.env.REFRESH_TOKEN_TTL_MS),
  };
}

exports.createToken = async (userId) => {
  const token = generateTokenObject({ userId });

  return await saveToken(token);
};

exports.rotateToken = async (oldToken) => {
  const rotatedToken = await Token.rotateTokenAtomic(oldToken);

  if (!rotatedToken) {
    throw TokenExpiredError();
  }

  const newToken = generateTokenObject({ expiresAt: rotatedToken.expiresAt, userId: rotatedToken.userId });
  const savedToken = await saveToken(newToken);

  await Token.replaceToken(rotatedToken.token, savedToken.token);

  return { newToken: savedToken, userId: rotatedToken.userId };
};

exports.revokeAllTokens = async (userId) => {
  await Token.revokeAllTokens(userId);
};