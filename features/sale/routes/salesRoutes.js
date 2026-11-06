const express = require("express");
const router = express.Router();

const SalesController = require("../controller/salesController");
const SseController = require("../controller/sseController");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { requireMaster } = require("../../../middlewares/roleMiddleware");

router.get("/admin", authMiddleware, SalesController.getAllSales);
router.get("/get", SalesController.getWeekSales);
router.get("/get/:vendorId", authMiddleware, SalesController.getSalesByVendor);
router.get("/events", SseController.getClient);
router.post("/webhook/sheet", SalesController.sheetSaleEntry);

// Importação: só o master. O corpo é o texto do CSV. O bodyParser.json do app
// ignora text/csv, então o limite de tamanho do arquivo é o daqui
const csvBody = express.text({ type: "text/csv", limit: "2mb" });
router.post("/import/preview", authMiddleware, requireMaster, csvBody, SalesController.previewImport);
router.post("/import", authMiddleware, requireMaster, csvBody, SalesController.importSales);

module.exports = router;
