const express = require("express");
const router = express.Router();

const authController = require("../controller/authController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { ChangePasswordSchema, LoginSchema } = require("../schemas/authSchemas");

// Não existe mais cadastro aberto: quem cadastra usuário é o admin (POST /users)
router.post("/login", validateSchema(LoginSchema), authController.loginUser);
router.post("/refresh", authController.refreshUserTokens);
// Sair: invalida o refresh token do cookie e apaga o cookie (funciona mesmo com o access token vencido)
router.post("/logout", authController.logoutUser);
// Qualquer perfil logado troca a própria senha (só a dele: o usuário vem do token)
router.post(
  "/change-password",
  authMiddleware,
  validateSchema(ChangePasswordSchema),
  authController.changePassword,
);

module.exports = router;
