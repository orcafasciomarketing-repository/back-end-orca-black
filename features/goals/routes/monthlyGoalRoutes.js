const express = require("express");
const router = express.Router();

const MonthlyGoalController = require("../controller/monthlyGoalController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdmin } = require("../../../middlewares/roleMiddleware");
const { SaveMonthlyGoalSchema } = require("../schemas/monthlyGoalSchemas");

// Fase de teste com o gestor: só master e admin veem e cadastram (b2b, b2g e colaboradores → 403)
router.use(authMiddleware, requireAdmin);

router.get("/:month", MonthlyGoalController.getMonth);
router.get("/:month/progress", MonthlyGoalController.getProgress);
router.get("/:month/history", MonthlyGoalController.getHistory);
router.put("/:month/:segment", validateSchema(SaveMonthlyGoalSchema), MonthlyGoalController.saveMonth);
router.delete("/:month/:segment", MonthlyGoalController.deleteMonth);

module.exports = router;
