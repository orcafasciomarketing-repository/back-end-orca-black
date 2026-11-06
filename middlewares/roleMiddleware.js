const { ForbiddenError } = require("../shared/errors");

// Usar depois do authMiddleware (que preenche o req.user)
exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return next(ForbiddenError());
  next();
};
