// Cache curto dos resultados das contas (placar, rankings, pontos, forecast, prêmios...). Quando chega uma
// venda, todas as telas abertas (admin, vendedores e TVs) pedem as mesmas contas ao mesmo tempo: com o cache,
// a conta é feita uma vez e a resposta é reaproveitada por alguns segundos. Qualquer gravação nos dados
// usados nas contas (vendas, vendedores, passagens, times, retiradas de prêmio, metas) limpa o cache na hora
// (ganchos nos models, com invalidateOnWrite), então ninguém vê dado velho depois de uma mudança.
// Os resultados são compartilhados entre quem pediu: quem usa não pode alterar o objeto recebido
const TTL_MS = 5000;

const entries = new Map();

const cached = (key, load) => {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = Promise.resolve().then(load);
  // Enquanto a conta roda, quem chegar espera por ela; o prazo só começa a contar quando ela termina
  const entry = { expiresAt: Infinity, promise };
  entries.set(key, entry);
  promise.then(
    () => {
      entry.expiresAt = Date.now() + TTL_MS;
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key);
    },
  );
  return promise;
};

const clear = () => entries.clear();

// Guarda o resultado de fn pelos argumentos recebidos (mesmos argumentos = mesma resposta)
const memoize = (name, fn) => (...args) => cached(`${name}:${JSON.stringify(args)}`, () => fn(...args));

const WRITE_HOOKS_DOCUMENT_MODEL = ["save", "insertMany", "bulkWrite"];
const WRITE_HOOKS_QUERY = [
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndReplace",
  "replaceOne",
];

// Liga os ganchos de gravação do schema para limpar este cache (e os outros caches passados)
const invalidateOnWrite = (schema, ...otherClears) => {
  const clearAll = () => {
    clear();
    otherClears.forEach((otherClear) => otherClear());
  };
  schema.post(WRITE_HOOKS_DOCUMENT_MODEL, clearAll);
  schema.post(WRITE_HOOKS_QUERY, clearAll);
};

module.exports = { cached, clear, memoize, invalidateOnWrite };
