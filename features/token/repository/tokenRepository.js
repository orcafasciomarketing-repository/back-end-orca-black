const Token = require("../model/tokenModel");

exports.save = async (tokenData) => {
  return await Token.create(tokenData);
};

exports.rotateTokenAtomic = async (oldToken) => {
  return await Token.findOneAndUpdate(
    { token: oldToken, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
  );
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
  return await Token.updateMany({ userId }, { $set: { revokedAt: new Date() } });
};
