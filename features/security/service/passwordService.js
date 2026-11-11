const bcrypt = require("bcrypt");

const pepper = process.env.PEPPER;

// Custo do bcrypt: cada ponto a mais dobra o tempo de conferir a senha. 10 é o mínimo recomendado e, com a
// pepper, segue seguro; no Render gratuito (0,1 CPU) leva ~1,5 s, contra ~50 s do custo 15 (o padrão antigo).
// ROUND_ENCRYPTION troca o valor (inteiro de 4 a 31); vazio ou inválido usa 10
const DEFAULT_ROUNDS = 10;
const parsedRounds = Number(process.env.ROUND_ENCRYPTION);
const rounds = Number.isInteger(parsedRounds) && parsedRounds >= 4 && parsedRounds <= 31 ? parsedRounds : DEFAULT_ROUNDS;

exports.hashPassword = async (password) => {
  return await bcrypt.hash(password + pepper, rounds);
};

exports.comparePassword = async (password, passwordHash) => {
  return await bcrypt.compare(password + pepper, passwordHash);
};

// Senha gravada com custo maior que o atual (ex.: as contas criadas com o custo 15): o login regrava com o atual
exports.needsRehash = (passwordHash) => {
  try {
    return bcrypt.getRounds(passwordHash) > rounds;
  } catch {
    return false;
  }
};

exports.rounds = rounds;
