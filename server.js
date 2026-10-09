const { connectDb } = require("./config/db");

const startServer = async (server) => {
  const serverPort = process.env.SERVER_PORT;
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
