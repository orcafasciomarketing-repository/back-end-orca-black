const express = require("express");
const router = express.Router();

const authController = require("../controller/authController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { LoginSchema } = require("../schemas/authSchemas");

// Não existe mais cadastro aberto: quem cadastra usuário é o admin (POST /users)
router.post("/login", validateSchema(LoginSchema), authController.loginUser);
router.post("/refresh", authController.refreshUserTokens);

module.exports = router;
