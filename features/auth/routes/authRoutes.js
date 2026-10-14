const express = require("express");
const router = express.Router();

const authController = require("../controller/authController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { RegisterSchema, LoginSchema } = require("../schemas/authSchemas");

router.post("/register", validateSchema(RegisterSchema), authController.registerUser);
router.post("/login", validateSchema(LoginSchema), authController.loginUser);
router.post("/refresh", authController.refreshUserTokens);

module.exports = router;
