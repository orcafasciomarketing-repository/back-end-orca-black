// Cache curto das vendas ativas. Quando chega uma venda, todas as telas abertas (admin e TVs) recarregam
// juntas e cada widget busca as vendas no banco: com o cache, as buscas iguais dentro de alguns segundos
// viram uma só. Qualquer gravação em vendas (Sales) limpa o cache na hora (ganchos no salesModel.js),
// então nenhuma tela vê dado velho depois de uma venda nova, cancelada ou importada
const TTL_MS = 5000;

const entries = new Map();

exports.cached = (key, load) => {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = load();
  entries.set(key, { expiresAt: Date.now() + TTL_MS, promise });
  promise.catch(() => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });
  return promise;
};

exports.clear = () => entries.clear();
