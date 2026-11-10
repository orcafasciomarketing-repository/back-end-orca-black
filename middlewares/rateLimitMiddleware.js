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

// Limite de tentativas erradas de login: conta só as respostas 401 (senha ou e-mail errados), por IP e
// e-mail. Um login certo zera a contagem. Assim várias pessoas do mesmo escritório (mesmo IP) entram
// normalmente, e quem tenta adivinhar a senha de alguém é barrado por um tempo
exports.failedLoginLimit = ({ windowMs, max }) => {
  const failuresByKey = new Map();

  const prune = (now) => {
    if (failuresByKey.size < 10000) return;
    for (const [key, entry] of failuresByKey) {
      if (now - entry.windowStart >= windowMs) failuresByKey.delete(key);
    }
  };

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}|${String(req.body?.email ?? "").trim().toLowerCase()}`;
    const current = failuresByKey.get(key);

    if (current && now - current.windowStart < windowMs && current.count >= max) {
      return res.status(429).json({ error: "Muitas tentativas de login. Espere alguns minutos e tente de novo" });
    }

    res.on("finish", () => {
      if (res.statusCode === 401) {
        const entry = failuresByKey.get(key);
        if (!entry || Date.now() - entry.windowStart >= windowMs) {
          failuresByKey.set(key, { windowStart: Date.now(), count: 1 });
        } else {
          entry.count += 1;
        }
        prune(Date.now());
      } else if (res.statusCode < 400) {
        failuresByKey.delete(key);
      }
    });

    next();
  };
};
