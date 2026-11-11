const express = require("express");
const router = express.Router();

const CampaignController = require("../controller/campaignController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireAdmin, requireAdminArea } = require("../../../middlewares/roleMiddleware");
const { SaveCampaignSchema } = require("../schemas/campaignSchemas");

// Ver (para escolher a campanha nas telas): todos os perfis do admin. Cadastrar, editar e excluir: master e admin
router.use(authMiddleware);

router.get("/", requireAdminArea, CampaignController.list);
router.post("/", requireAdmin, validateSchema(SaveCampaignSchema), CampaignController.create);
router.put("/:id", requireAdmin, validateSchema(SaveCampaignSchema), CampaignController.update);
router.delete("/:id", requireAdmin, CampaignController.remove);

module.exports = router;
