let responses = [];

exports.addClient = (clientRes, req) => {
  responses.push(clientRes);
  req.on("close", () => {
    responses = responses.filter((item) => item !== clientRes);
  });
};

exports.broadcast = (eventData) => {
  responses.forEach((res) => res.write(`data: ${JSON.stringify(eventData)}\n\n`));
};
