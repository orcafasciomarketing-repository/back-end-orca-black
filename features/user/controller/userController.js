const UserService = require("../service/userService");

exports.getUsers = async (req, res, next) => {
  const users = await UserService.findAll();
  return res.status(200).json({
    success: true,
    data: users,
    message: "Usuários recuperados com sucesso",
  });
};

exports.createUser = async (req, res, next) => {
  const user = await UserService.createUser(req.data);
  return res.status(201).json({
    success: true,
    data: user,
    message: "Usuário cadastrado com sucesso",
  });
};

exports.updateUser = async (req, res, next) => {
  const user = await UserService.updateUser(req.params.id, req.data, req.user.id);
  return res.status(200).json({
    success: true,
    data: user,
    message: "Usuário atualizado com sucesso",
  });
};

exports.deleteUser = async (req, res, next) => {
  await UserService.deleteUser(req.params.id, req.user.id);
  return res.status(200).json({
    success: true,
    message: "Usuário excluído com sucesso",
  });
};
