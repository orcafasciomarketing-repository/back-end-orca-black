const express = require("express");
const router = express.Router();

const AnalyticsController = require("../controller/analyticsController");

router.get("/scoreboard", AnalyticsController.getScoreboard);
router.get("/scoreboard/last-week", AnalyticsController.getLastWeekScoreboard);
router.get("/teams/:teamId", AnalyticsController.getTeamLineup);
router.get("/ranking", AnalyticsController.getSellerRanking);
router.get("/ranking/last-week", AnalyticsController.getLastWeekSellerRanking);
router.get("/sdr-ranking", AnalyticsController.getSdrRanking);
router.get("/sdr-ranking/last-week", AnalyticsController.getLastWeekSdrRanking);

module.exports = router;