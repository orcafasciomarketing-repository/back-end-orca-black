const { verifyAccessToken } = require("../shared/accessTokenService");
const { UnauthorizedError } = require("../shared/errors");

exports.authMiddleware = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      const error = new Error("Token não encontrado");
      error.status = 401;
      throw error;
    }
    const token = req.headers.authorization.split(" ")[1];
    const validatedToken = verifyAccessToken(token);

    req.token = validatedToken;

    next();
  } catch (err) {
    // Token inválido ou expirado: o jsonwebtoken lança erro sem status, que viraria 500
    if (!err.status) return next(UnauthorizedError("Token inválido ou expirado"));
    next(err);
  }
};
