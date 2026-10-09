const { addClient } = require("../../../shared/sseManager");

exports.getClient = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  addClient(res, req);
};
