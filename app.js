const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const authRoutes = require("./features/auth/routes/authRoutes");
const salesRoutes = require("./features/sale/routes/salesRoutes");
const analyticsRoutes = require("./features/analytics/routes/analyticsRoutes");
const vendorRoutes = require("./features/vendors/routes/vendorRoutes");
const sdrRoutes = require("./features/sdr/routes/sdrRoutes");
const logsRoutes = require("./features/logs/routes/logsRoutes");
const userRoutes = require("./features/user/routes/userRoutes");
const meRoutes = require("./features/me/routes/meRoutes");
const prizeRoutes = require("./features/prizes/routes/prizeRoutes");
const monthlyGoalRoutes = require("./features/goals/routes/monthlyGoalRoutes");

const app = express();

// No Render a requisição passa por 1 proxy: assim o req.ip é o IP de quem chamou
// (usado pelo limite de requisições do POST /logs), e não o do proxy
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Cabeçalhos de segurança básicos (a API só devolve JSON e as imagens de /public)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(bodyParser.json());
app.use(cookieParser());
app.use("/public", express.static("public"));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://192.168.1.22:5173",
      "http://192.168.1.35:5173",
      "http://192.168.1.21:5173",
      "http://192.168.1.36",
      "http://192.168.1.112:5173",
      "http://192.168.1.115:5173",
      "http://192.168.1.99:5173",
      "http://192.168.1.200:5173",
      "http://192.168.1.63:5173",
      "http://192.168.1.72:5173",
      "http://192.168.1.195:5173",
      // Endereço do front publicado (ex.: https://seu-front.onrender.com)
      ...(process.env.FRONT_URL ? [process.env.FRONT_URL] : []),
    ],
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Connection",
    ],
    credentials: true,
  }),
);

app.use("/auth", authRoutes);
app.use("/sales", salesRoutes);
app.use("/vendor", vendorRoutes);
app.use("/sdr", sdrRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/logs", logsRoutes);
app.use("/users", userRoutes);
app.use("/me", meRoutes);
app.use("/prizes", prizeRoutes);
app.use("/goals", monthlyGoalRoutes);

// Erro esperado (validação, 401, 403, 404...) devolve a mensagem dele. Erro inesperado (500) fica só no log
// do servidor: a resposta não mostra detalhes internos (banco, código)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(err);
    return res.status(status).json({ error: "Erro interno do servidor" });
  }
  res.status(status).json({ error: err.message || "Requisição inválida" });
});

module.exports = { app };
