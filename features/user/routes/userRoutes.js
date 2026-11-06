const express = require("express");
const router = express.Router();

const UserController = require("../controller/userController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdmin } = require("../../../middlewares/roleMiddleware");
const { CreateUserSchema, UpdateUserSchema } = require("../schemas/userSchemas");

// Gestão de usuários: só o perfil admin
router.use(authMiddleware, requireAdmin);

router.get("/", UserController.getUsers);
router.post("/", validateSchema(CreateUserSchema), UserController.createUser);
router.patch("/:id", validateSchema(UpdateUserSchema), UserController.updateUser);
router.delete("/:id", UserController.deleteUser);

module.exports = router;
