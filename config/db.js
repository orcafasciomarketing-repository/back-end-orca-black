const { connect } = require("mongoose");

const connectDb = async () => {
  try {
    const connection = await connect(process.env.MONGO_URI);
    console.log("Banco conectado");
    return connection;
  } catch (err) {
    console.log("Erro ao inicializar o banco de dados: " + err.message);
    process.exit(1);
  }
};

module.exports = { connectDb };
