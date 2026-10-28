const { connectDb } = require("./config/db");

const startServer = async (server) => {
  // No Render a porta vem em PORT; localmente continua usando a SERVER_PORT do .env
  const serverPort = process.env.SERVER_PORT || process.env.PORT;
  try {
    await connectDb();
    server.listen(serverPort);
    console.log("Servidor iniciado na porta: " + serverPort);
  } catch (err) {
    console.error("Erro ao iniciar o servidor: ", err.message);
    process.exit(1);
  }
};

module.exports = { startServer };
