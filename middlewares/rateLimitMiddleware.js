// Limita quantas requisições cada IP pode fazer numa janela de tempo.
// Cada chamada cria um limitador com contagem própria (guardada em memória).
exports.rateLimit = ({ windowMs, max }) => {
  const requestsByIp = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const current = requestsByIp.get(req.ip);

    // Primeira requisição do IP, ou a janela anterior já acabou: recomeça a contagem
    if (!current || now - current.windowStart >= windowMs) {
      requestsByIp.set(req.ip, { windowStart: now, count: 1 });
      return next();
    }

    if (current.count >= max) {
      return res.status(429).json({ error: "Muitas requisições, tente novamente mais tarde" });
    }

    current.count += 1;
    next();
  };
};
