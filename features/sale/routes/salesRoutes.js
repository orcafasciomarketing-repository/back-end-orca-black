const express = require("express");
const router = express.Router();

const SalesController = require("../controller/salesController");
const SseController = require("../controller/sseController");
const { authMiddleware } = require("../../../middlewares/authMidleware");

router.get("/admin", authMiddleware, SalesController.getAllSales);
router.get("/get", SalesController.getWeekSales);
router.get("/get/:vendorId", authMiddleware, SalesController.getSalesByVendor);
router.get("/events", SseController.getClient);
router.post("/webhook/deal", SalesController.webhookSaleEntry)


module.exports = router;
