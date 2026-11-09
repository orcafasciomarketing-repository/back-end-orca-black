const express = require("express");
const router = express.Router();

const PrizeController = require("../controller/prizeController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdminArea, requireMaster } = require("../../../middlewares/roleMiddleware");
const { CreateWithdrawalSchema } = require("../schemas/prizeSchemas");

// Ver: master, admin, b2b e b2g (b2b/b2g só o próprio setor). Registrar e excluir: só o master
router.use(authMiddleware);

router.get("/", requireAdminArea, PrizeController.getSummary);
router.get("/withdrawals", requireAdminArea, PrizeController.getWithdrawals);
router.post("/withdrawals", requireMaster, validateSchema(CreateWithdrawalSchema), PrizeController.createWithdrawal);
router.delete("/withdrawals/:id", requireMaster, PrizeController.deleteWithdrawal);

module.exports = router;
