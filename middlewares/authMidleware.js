const { isValidObjectId } = require("mongoose");

const { verifyAccessToken } = require("../shared/accessTokenService");
const { ForbiddenError, UnauthorizedError } = require("../shared/errors");
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

    // "Acessar como" (master vendo a área de um colaborador): quem abriu precisa continuar sendo o master, e o
    // acesso é só para ver (nenhuma gravação, nem trocar a senha da pessoa)
    let impersonatedBy = null;
    if (validatedToken.impersonatedBy) {
      const master = isValidObjectId(validatedToken.impersonatedBy)
        ? await UserService.findUserById(validatedToken.impersonatedBy)
        : null;
      if (!master || getUserRole(master) !== "master") throw UnauthorizedError("Acesso como outra pessoa encerrado");
      if (!["GET", "HEAD"].includes(req.method)) {
        throw ForbiddenError("No modo \"acessar como\" dá só para ver");
      }
      impersonatedBy = master.email;
    }

    req.token = validatedToken;
    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: getUserRole(user),
      vendorId: user.vendorId ? user.vendorId.toString() : null,
      sdrId: user.sdrId ? user.sdrId.toString() : null,
      // Setor cujas metas o admin gerencia (cadastro e o que os vendedores veem); null = todos
      manageSegment: user.role === "admin" ? user.manageSegment ?? null : null,
      impersonatedBy,
    };

    next();
  } catch (err) {
    next(err);
  }
};
