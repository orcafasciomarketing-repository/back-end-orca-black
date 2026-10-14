const express = require("express");
const router = express.Router();

const SalesController = require("../controller/salesController");
const SseController = require("../controller/sseController");
const { authMiddleware } = require("../../../middlewares/authMidleware");

router.get("/admin", authMiddleware, SalesController.getSales);
router.get("/get", SalesController.getSalesByPeriod);
router.get("/get/:vendorId", authMiddleware, SalesController.findSaleByVendor);
router.get("/events", SseController.getClient);
router.post("/webhook/deal", SalesController.webhookSaleEntry)


module.exports = router;
