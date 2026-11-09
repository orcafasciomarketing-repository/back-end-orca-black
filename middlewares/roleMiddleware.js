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

// Telas do admin (vendas de todos, forecast, pontos): todos os perfis, menos os de colaborador
exports.requireAdminArea = allowRoles("master", "admin", "b2b", "b2g");

// Área do colaborador (/me): só vendedor e pessoa de passagem
exports.requirePerson = allowRoles("vendor", "sdr");
