const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const authRoutes = require("./features/auth/routes/authRoutes");
const salesRoutes = require("./features/sale/routes/salesRoutes");
const analyticsRoutes = require("./features/analytics/routes/analyticsRoutes");
const vendorRoutes = require("./features/vendors/routes/vendorRoutes");
const sdrRoutes = require("./features/sdr/routes/sdrRoutes");

const app = express();

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

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Erro interno do servidor";
  res.status(status).json({ error: message });
});

module.exports = { app };
