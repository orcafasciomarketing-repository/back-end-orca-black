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

// Tolerância para duas abas do mesmo navegador renovando ao mesmo tempo com o mesmo cookie:
// a primeira troca o token; a segunda chega com o token que acabou de ser trocado
const ROTATION_GRACE_MS = 30 * 1000;

// O token foi trocado há pouco e a sessão continua valendo (o token que entrou no lugar não foi revogado
// por sair, trocar a senha ou excluir o usuário): devolve um token novo da mesma sessão
async function recentlyRotated(oldToken) {
  if (!oldToken) return null;
  const old = await Token.findByToken(oldToken);
  if (!old?.rotatedAt) return null;
  if (Date.now() - new Date(old.rotatedAt).getTime() > ROTATION_GRACE_MS) return null;
  if (new Date(old.expiresAt).getTime() <= Date.now()) return null;
  // A outra aba ainda está no meio da troca (o token novo ainda não foi ligado ao antigo)
  if (!old.revokedBy) return old;

  const replacement = await Token.findByToken(old.revokedBy);
  const sessionAlive = replacement && (replacement.revokedAt === null || replacement.rotatedAt !== null);
  return sessionAlive ? old : null;
}

exports.rotateToken = async (oldToken) => {
  const rotatedToken = (await Token.rotateTokenAtomic(oldToken)) ?? (await recentlyRotated(oldToken));

  if (!rotatedToken) {
    throw TokenExpiredError();
  }

  const newToken = generateTokenObject({ expiresAt: rotatedToken.expiresAt, userId: rotatedToken.userId });
  const savedToken = await saveToken(newToken);

  if (!rotatedToken.revokedBy) await Token.replaceToken(rotatedToken.token, savedToken.token);

  return { newToken: savedToken, userId: rotatedToken.userId };
};

exports.revokeAllTokens = async (userId) => {
  await Token.revokeAllTokens(userId);
};

exports.revokeToken = async (token) => {
  await Token.revokeToken(token);
};