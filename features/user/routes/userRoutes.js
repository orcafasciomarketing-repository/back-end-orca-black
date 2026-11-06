const express = require("express");
const router = express.Router();

const UserController = require("../controller/userController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdmin, requireMaster } = require("../../../middlewares/roleMiddleware");
const { CreateUserSchema, UpdateUserSchema } = require("../schemas/userSchemas");

// Ver e cadastrar: master e admin. Trocar perfil/senha e excluir: só o master
router.use(authMiddleware);

router.get("/", requireAdmin, UserController.getUsers);
router.post("/", requireAdmin, validateSchema(CreateUserSchema), UserController.createUser);
router.patch("/:id", requireMaster, validateSchema(UpdateUserSchema), UserController.updateUser);
router.delete("/:id", requireMaster, UserController.deleteUser);

module.exports = router;
