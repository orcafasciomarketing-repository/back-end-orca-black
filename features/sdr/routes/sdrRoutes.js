const express = require("express");
const router = express.Router();

const SdrController = require("../controller/sdrController");
router.get("/list", SdrController.getAllSdrs);

module.exports = router;
