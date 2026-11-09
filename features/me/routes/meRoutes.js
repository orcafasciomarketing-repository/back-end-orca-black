const express = require("express");
const router = express.Router();

const MeController = require("../controller/meController");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requirePerson } = require("../../../middlewares/roleMiddleware");

// Área do colaborador: a pessoa vem sempre do token (nunca da URL), então ninguém vê dados de outro
router.use(authMiddleware, requirePerson);

router.get("/", MeController.getProfile);
router.get("/sales", MeController.getSales);
router.get("/team", MeController.getTeam);

module.exports = router;
