const express = require("express");
const router = express.Router();

const SalesController = require("../controller/salesController");
const SseController = require("../controller/sseController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { CreateSalesSchema, UpdateSalesSchema } = require("../schemas/salesSchemas");

router.get("/admin", SalesController.getSales);
router.get("/get", SalesController.getSalesByPeriod);
router.get("/get/:vendorId", SalesController.findSaleByVendor);
router.get("/events", SseController.getClient);
router.post("/create", authMiddleware, validateSchema(CreateSalesSchema), SalesController.createSales);
router.post("/webhook/deal", SalesController.webhookSaleEntry)
router.patch("/update/:salesId", authMiddleware, validateSchema(UpdateSalesSchema), SalesController.updateSale);


module.exports = router;
