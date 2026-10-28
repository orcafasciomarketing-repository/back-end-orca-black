let responses = [];

// Sem venda, a conexão fica muda e o proxy do Render pode derrubar a TV.
// A cada 30s manda um comentário SSE (linha com ":"), que o EventSource ignora
const HEARTBEAT_INTERVAL_MS = 30000;

const heartbeat = setInterval(() => {
  responses.forEach((res) => res.write(": ping\n\n"));
}, HEARTBEAT_INTERVAL_MS);

// O timer não segura o processo aberto (senão os testes nunca terminam)
heartbeat.unref();

exports.addClient = (clientRes, req) => {
  responses.push(clientRes);
  req.on("close", () => {
    responses = responses.filter((item) => item !== clientRes);
  });
};

exports.broadcast = (eventData) => {
  responses.forEach((res) => res.write(`data: ${JSON.stringify(eventData)}\n\n`));
};
