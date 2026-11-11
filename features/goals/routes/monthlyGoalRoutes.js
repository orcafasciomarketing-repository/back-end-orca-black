const express = require("express");
const router = express.Router();

const MonthlyGoalController = require("../controller/monthlyGoalController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdmin, requireGoalSegment } = require("../../../middlewares/roleMiddleware");
const { SaveMonthlyGoalSchema, GoalVisibilitySchema } = require("../schemas/monthlyGoalSchemas");

// Ver: master e admin (todos os setores). Cadastrar, editar, excluir e escolher o que os vendedores veem: o master
// e o admin que gerencia o setor da URL (admin sem setor que gerencia = todos). b2b, b2g e colaboradores → 403
router.use(authMiddleware, requireAdmin);

router.get("/", MonthlyGoalController.listMonths);
router.get("/:month", MonthlyGoalController.getMonth);
router.get("/:month/progress", MonthlyGoalController.getProgress);
router.get("/:month/history", MonthlyGoalController.getHistory);
router.put("/:month/:segment", requireGoalSegment, validateSchema(SaveMonthlyGoalSchema), MonthlyGoalController.saveMonth);
router.put(
  "/:month/:segment/visibility",
  requireGoalSegment,
  validateSchema(GoalVisibilitySchema),
  MonthlyGoalController.saveVisibility,
);
router.delete("/:month/:segment", requireGoalSegment, MonthlyGoalController.deleteMonth);

module.exports = router;
