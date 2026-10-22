const { addClient } = require("../../../shared/sseManager");

exports.getClient = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Manda os cabeçalhos já: sem isso o Node só envia na primeira venda,
  // e a TV fica "conectando" até lá
  res.flushHeaders();

  addClient(res, req);
};
