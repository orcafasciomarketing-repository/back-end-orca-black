const express = require("express");
const router = express.Router();

const LogsController = require("../controller/logsController");
const { validateSchema } = require("../../../middlewares/schemaValidationMiddleware");
const { authMiddleware } = require("../../../middlewares/authMidleware");
const { rateLimit } = require("../../../middlewares/rateLimitMiddleware");
const { CreateLogSchema } = require("../schemas/logsSchemas");

// Rota pública (as TVs não fazem login): limita a 60 logs por minuto por IP.
// As TVs do escritório saem pelo mesmo IP, então o limite vale para todas juntas.
// Passou do limite → 429, e o front guarda o log no localStorage
const createLogRateLimit = rateLimit({ windowMs: 60 * 1000, max: 60 });

router.post("/", createLogRateLimit, validateSchema(CreateLogSchema), LogsController.createLog);
router.get("/", authMiddleware, LogsController.getLogs);

module.exports = router;
