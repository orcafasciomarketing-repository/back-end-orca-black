const { isValidObjectId } = require("mongoose");

const { verifyAccessToken } = require("../shared/accessTokenService");
const { UnauthorizedError } = require("../shared/errors");
const UserService = require("../features/user/service/userService");
const { getUserRole } = require("../config/roles");

exports.authMiddleware = async (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      const error = new Error("Token não encontrado");
      error.status = 401;
      throw error;
    }
    const token = req.headers.authorization.split(" ")[1];
    // Token inválido ou expirado: o jsonwebtoken lança erro sem status, que viraria 500
    let validatedToken;
    try {
      validatedToken = verifyAccessToken(token);
    } catch {
      throw UnauthorizedError("Token inválido ou expirado");
    }

    // O perfil vem do banco, não do token: trocar o perfil ou excluir o usuário
    // vale na hora, sem esperar o token expirar
    const user = isValidObjectId(validatedToken.userId)
      ? await UserService.findUserById(validatedToken.userId)
      : null;
    if (!user) throw UnauthorizedError("Usuário não encontrado");

    req.token = validatedToken;
    req.user = { id: user._id.toString(), email: user.email, role: getUserRole(user) };

    next();
  } catch (err) {
    next(err);
  }
};
