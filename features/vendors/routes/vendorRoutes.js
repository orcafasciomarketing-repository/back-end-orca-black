const express = require("express");
const router = express.Router();

const VendorController = require("../controller/vendorController");

router.get("/list", VendorController.getAllVendors);

module.exports = router;
