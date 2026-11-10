const Token = require("../model/tokenModel");

exports.save = async (tokenData) => {
  return await Token.create(tokenData);
};

exports.rotateTokenAtomic = async (oldToken) => {
  const now = new Date();
  return await Token.findOneAndUpdate(
    { token: oldToken, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, rotatedAt: now } },
  );
};

exports.findByToken = async (token) => {
  return await Token.findOne({ token }).lean();
};

exports.replaceToken = async (oldToken, newToken) => {
  return await Token.updateOne(
    {
      token: oldToken,
    },
    { $set: { revokedBy: newToken } },
  );
};

exports.revokeAllTokens = async (userId) => {
  return await Token.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

exports.revokeToken = async (token) => {
  return await Token.updateOne({ token, revokedAt: null }, { $set: { revokedAt: new Date() } });
};
