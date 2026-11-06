const { ForbiddenError } = require("../shared/errors");

// Usar depois do authMiddleware (que preenche o req.user com o perfil que vale)
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return next(ForbiddenError());
  next();
};

// Importação, erros, editar e excluir usuários: só o master
exports.requireMaster = allowRoles("master");

// Ver e cadastrar usuários: master e admin
exports.requireAdmin = allowRoles("master", "admin");
