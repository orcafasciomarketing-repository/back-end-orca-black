const express = require("express");
const router = express.Router();

const authController = require("../controller/authController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { failedLoginLimit } = require("../../../middlewares/rateLimitMiddleware");
const { requireMaster } = require("../../../middlewares/roleMiddleware");
const { ChangePasswordSchema, LoginSchema } = require("../schemas/authSchemas");

// Não existe mais cadastro aberto: quem cadastra usuário é o admin (POST /users)
// Até 10 tentativas erradas a cada 15 minutos por IP e e-mail (login certo zera a contagem)
const loginLimit = failedLoginLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post("/login", loginLimit, validateSchema(LoginSchema), authController.loginUser);
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

// "Acessar como": só o master, só contas de vendedor e passagem, só para ver (ver authMidleware)
router.post("/impersonate/:id", authMiddleware, requireMaster, authController.impersonate);

module.exports = router;
