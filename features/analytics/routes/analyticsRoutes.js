const express = require("express");
const router = express.Router();

const AnalyticsController = require("../controller/analyticsController");

router.get("/goal", AnalyticsController.getGoalProgress);
router.get("/scoreboard", AnalyticsController.getScoreboard);
router.get("/scoreboard/last-week", AnalyticsController.getLastWeekScoreboard);
router.get("/ranking", AnalyticsController.getVendorRanking);
router.get("/ranking/last-week", AnalyticsController.getLastWeekVendorRanking);
router.get("/sdr-ranking", AnalyticsController.getSdrRanking);
router.get("/sdr-ranking/last-week", AnalyticsController.getLastWeekSdrRanking);

module.exports = router;
