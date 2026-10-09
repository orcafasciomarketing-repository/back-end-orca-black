require("dotenv").config();

const { app } = require("./app");
const { startServer } = require("./server");

startServer(app);
