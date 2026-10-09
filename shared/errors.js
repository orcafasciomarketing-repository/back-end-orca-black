function createErrorObject(message, statusCode) {
  const error = new Error(message);
  error.status = statusCode;
  return error;
}

exports.ConflictError = (message = "Cadastro já realizado") => {
  return createErrorObject(message, 409);
};

exports.NotFoundError = (message = "Dado não encontrado") => {
  return createErrorObject(message, 404);
};

exports.UnauthorizedError = (message = "Acesso negado") => {
  return createErrorObject(message, 401);
};

exports.TokenExpiredError = (message = "Token expirado") => {
  return createErrorObject(message, 401);
};

exports.ValidationError = (message = "Request sem dados ou inválidos") => {
  return createErrorObject(message, 400);
};

exports.DependencyError = (message = "Não é possível excluir, dados vinculados") => {
  return createErrorObject(message, 409);
};
