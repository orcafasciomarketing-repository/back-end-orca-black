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

// Metas de um setor (:segment na URL): cadastrar, editar, excluir e escolher o que os vendedores veem.
// Master: todos. Admin: o setor que gerencia (sem setor gravado = todos). Os outros perfis nem chegam aqui (requireAdmin)
exports.requireGoalSegment = (req, res, next) => {
  const { role, manageSegment } = req.user ?? {};
  if (role === "master") return next();
  if (role === "admin" && (!manageSegment || manageSegment === req.params.segment)) return next();
  next(ForbiddenError(`Você só gerencia as metas do ${String(manageSegment ?? "").toUpperCase()}`));
};

// Área do colaborador (/me): só vendedor e pessoa de passagem
exports.requirePerson = allowRoles("vendor", "sdr");
