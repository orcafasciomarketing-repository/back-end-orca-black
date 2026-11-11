// Regrava com o custo atual do bcrypt (10) as senhas de colaboradores que ainda são a senha inicial do seed
// (Nome123) e estão gravadas com custo maior (o antigo 15, ~50 s por login no Render gratuito).
// A senha continua a mesma e ninguém sai do sistema. Quem já trocou a senha não é mexido (o login dessa
// pessoa regrava sozinho, uma vez). Roda à mão, fora do deploy, com o MONGO_URI e a PEPPER do .env:
//   node scripts/rehashSenhas.js --banco=bo-dash           simulação: só conta, não grava nada
//   node scripts/rehashSenhas.js --banco=bo-dash --gravar  regrava
// --banco: o nome do banco de produção (o MONGO_URI local não traz o nome e cairia no banco "test")
const os = require("node:os");

// Mais conferências do bcrypt em paralelo (cada uma leva alguns segundos no custo 15)
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, os.cpus().length));

require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const User = require("../features/user/model/userModel");
const Vendors = require("../features/vendors/model/vendorsModel");
const SDR = require("../features/sdr/model/sdrModel");
const { comparePassword, hashPassword, needsRehash, rounds } = require("../features/security/service/passwordService");
const { personPassword } = require("../seed");

const shouldWrite = process.argv.includes("--gravar");
const dbName = process.argv.find((arg) => arg.startsWith("--banco="))?.slice("--banco=".length) || undefined;
const CONCURRENCY = Number(process.env.UV_THREADPOOL_SIZE);

const nameOf = async (user) => {
  if (user.vendorId) return (await Vendors.findById(user.vendorId).lean())?.vendorName ?? null;
  if (user.sdrId) return (await SDR.findById(user.sdrId).lean())?.name ?? null;
  return null;
};

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI não definida no .env");
  await mongoose.connect(process.env.MONGO_URI, dbName ? { dbName } : {});
  console.log(`Banco: ${mongoose.connection.db.databaseName}${shouldWrite ? "" : " (simulação)"}`);

  const users = await User.find({ role: { $in: ["vendor", "sdr"] } }).select("+passwordHash").lean();
  const slow = users.filter((user) => needsRehash(user.passwordHash));
  const result = { total: users.length, slow: slow.length, initialPassword: 0, changedPassword: 0, noPerson: 0, written: 0 };
  const started = Date.now();

  console.log(`Colaboradores: ${users.length}. Com custo maior que ${rounds}: ${slow.length}. Conferindo...`);

  const queue = [...slow];
  const worker = async () => {
    for (let user = queue.shift(); user; user = queue.shift()) {
      const name = await nameOf(user);
      if (!name) {
        result.noPerson += 1;
        continue;
      }
      const password = personPassword(name);
      if (!(await comparePassword(password, user.passwordHash))) {
        result.changedPassword += 1;
        continue;
      }
      result.initialPassword += 1;
      if (shouldWrite) {
        const passwordHash = await hashPassword(password);
        await User.updateOne({ _id: user._id, passwordHash: user.passwordHash }, { $set: { passwordHash } });
        result.written += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(
    [
      `Ainda com a senha inicial: ${result.initialPassword}`,
      `Já trocaram a senha (não mexe): ${result.changedPassword}`,
      `Sem pessoa no cadastro (não mexe): ${result.noPerson}`,
      shouldWrite ? `Regravadas com custo ${rounds}: ${result.written}` : "Simulação: nada foi gravado (use --gravar)",
      `Tempo: ${Math.round((Date.now() - started) / 1000)} s`,
    ].join("\n"),
  );
  return result;
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error(`Erro: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => mongoose.connection.close());
}
