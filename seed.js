require("dotenv").config();

const mongoose = require("mongoose");

const Teams = require("./features/teams/model/teamsModel");
const Vendors = require("./features/vendors/model/vendorsModel");
const SDR = require("./features/sdr/model/sdrModel");
const User = require("./features/user/model/userModel");
const { hashPassword } = require("./features/security/service/passwordService");

const MONGO_URI = process.env.MONGO_URI;

const seedTeamData = [
  {
    name: "Wizards of sales",
    imageUrl: "https://back-end-orca-black.onrender.com/public/wizard.jpg",
  },
  {
    name: "Orçawinx",
    imageUrl: "https://back-end-orca-black.onrender.com/public/orcawinx.jpg",
  },
  {
    name: "Sem freio",
    imageUrl: "https://back-end-orca-black.onrender.com/public/sem-freio.jpg",
  },
];
const seedVendorData = [
  {
    vendorName: "Joice Pereira",
    rdUserId: "69a187e608c9d00015e148c3",
    job: "B2G Farmer",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/joice-pereira.webp",
  },
  {
    vendorName: "Renan Souza",
    rdUserId: "69a59e77489a750013588135",
    job: "B2B Farmer",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/renan-souza.webp",
  },
  {
    vendorName: "Giovana Evaristo",
    rdUserId: "69a59dc6b8f0cd001c9b6167",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/giovana-evaristo.webp",
  },
  {
    vendorName: "Rayssa Souza",
    rdUserId: "698b8d1b1ce949001ac2c88b",
    job: "B2B Venda",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/rayssa-souza.webp",
  },
  {
    vendorName: "Danne Allbuquerque",
    rdUserId: "632cf85b356f19000c64f466",
    job: "B2B Farmer",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/danne-allbuquerque.webp",
  },
  {
    vendorName: "Nicolly Vilella",
    rdUserId: "69a59de6a261e400164a77cd",
    job: "B2B Farmer",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/nicolly-vilella.webp",
  },
  {
    vendorName: "Samuel Pacheco",
    rdUserId: "69a59e2fc641030019e4e881",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/samuel-pacheco.webp",
  },
  {
    vendorName: "Maria Bezerra",
    rdUserId: "69a0a37d29b9c80012fa9aed",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/maria-bezerra.webp",
  },
  {
    vendorName: "Brenda Florêncio",
    rdUserId: "69a598336480fa0016aa1961",
    job: "B2B Venda",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/brenda-florencio.webp",
  },
  {
    vendorName: "Victoria Amaral",
    rdUserId: "69a597f2d9a07d001362388f",
    job: "B2B Venda",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/victoria-amaral.webp",
  },
  {
    vendorName: "Heitor Santinon",
    rdUserId: "69a0a0fea2bf0000178bed39",
    job: "B2G Venda",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/heitor-santinon.webp",
  },
  {
    vendorName: "Roberta Campos",
    rdUserId: "6a9737c243fd3e0029f21c29",
    job: "B2B Farmer",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/roberta-campos.webp",
  },
  {
    vendorName: "Sabrina Oliveira",
    rdUserId: "69a59dbf25bbed0016c4647a",
    job: "B2B Farmer",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/sabrina-oliveira.webp",
  },
  {
    vendorName: "Marcelo Brandi",
    rdUserId: "69a59e50b8f0cd00169b600d",
    job: "B2B Farmer",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/marcelo-brandi.webp",
  },
  {
    vendorName: "Wagner Camillo",
    rdUserId: "69a0a147799e1e0013c3d027",
    job: "B2G Farmer",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/wagner-camillo.webp",
  },
  {
    vendorName: "Jullya Freitas",
    rdUserId: "69a59860f5fa7900159ab15c",
    job: "B2B Venda",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/jullya-freitas.webp",
  },
  {
    vendorName: "Jonathan",
    rdUserId: "69a0ade3db22f3001f7b72d3",
    job: "B2G Venda",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/jonathan.webp",
  },
];

const seedSdrData = [
  {
    name: "Victor Batilochi",
    job: "B2B SDR",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/victor-batilochi.webp",
  },
  {
    name: "Gabriel Rinaldo",
    job: "CS",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/gabriel-rinaldo.webp",
  },
  {
    name: "Fernanda Prado",
    job: "B2G SDR",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/fernanda-prado.webp",
  },
  {
    name: "Julia Barrau",
    job: "Suporte",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/julia-barrau.webp",
  },
  {
    name: "Caio Cezar",
    job: "CS",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/caio-cezar.webp",
  },
  {
    name: "Matheus Vicente",
    job: "B2G SDR",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/matheus-vicente.webp",
  },
  {
    name: "Julia Tomaz",
    job: "Suporte",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/julia-tomaz.webp",
  },

  {
    name: "Giovanni Reis",
    job: "CS",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/giovanni-reis.webp",
  },
  {
    name: "Ana Clara",
    job: "B2G SDR",
    teamName: "Orçawinx",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/ana-clara.webp",
  },
  {
    name: "Vinícius Pereira",
    job: "B2G SDR",
    teamName: "Wizards of sales",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/vinicius-pereira.webp",
  },
  {
    name: "Leticia Ferreira",
    job: "Suporte",
    teamName: "Sem freio",
    imageUrl:
      "https://back-end-orca-black.onrender.com/public/colaboradores/leticia-ferreira.webp",
  },
];

// Primeira vez (banco vazio): cadastra times, vendedores e sdr.
// Banco já cadastrado: só atualiza as imagens. Nunca apaga nem recria ninguém,
// senão os _id mudam e as vendas perdem o vínculo com quem vendeu
async function runSeed(data) {
  try {
    await mongoose.connect(MONGO_URI);

    const teamsCount = await Teams.countDocuments();
    if (teamsCount > 0) {
      await updateImages(data);
      console.log("Banco já cadastrado: só as imagens foram atualizadas");
    } else {
      await createTeams(data);
      console.log("Times, vendedores e sdr cadastrados com sucesso");
    }

    await createPersonUsers();
  } catch (err) {
    console.log(`Error: ${err}`);
    // Sai com erro: se o seed rodar no build do Render, o deploy falha em vez de seguir
    process.exitCode = 1;
  } finally {
    mongoose.connection.close();
    console.log("Conexão fechada.");
  }
}

async function updateImages(teams) {
  for (const team of teams) {
    await updateImage(Teams, { name: team.name }, team.imageUrl);
  }
  for (const vendor of seedVendorData) {
    await updateImage(
      Vendors,
      { vendorName: vendor.vendorName },
      vendor.imageUrl,
    );
  }
  for (const sdr of seedSdrData) {
    await updateImage(SDR, { name: sdr.name }, sdr.imageUrl);
  }
}

// Sem imagem no seed, não mexe (não apaga a que já está no banco)
async function updateImage(model, filter, imageUrl) {
  if (!imageUrl) return;
  await model.updateOne(filter, { $set: { imageUrl } });
}

async function createTeams(data) {
  const teams = await Teams.insertMany(data);
  for (const team of teams) {
    const filteredVendor = seedVendorData.filter(
      (item) => item.teamName === team.name,
    );
    const filteredSdr = seedSdrData.filter(
      (item) => item.teamName === team.name,
    );
    await createVendorBase(team._id, filteredVendor);
    await createSdrBase(team._id, filteredSdr);
  }
}

async function createVendorBase(teamId, vendors) {
  const teamVendor = vendors.map((vendor) => ({
    vendorName: vendor.vendorName,
    rdUserId: vendor.rdUserId,
    job: vendor.job,
    teamId,
    imageUrl: vendor.imageUrl,
  }));
  await Vendors.insertMany(teamVendor);
}

async function createSdrBase(teamId, sdrs) {
  const teamSdr = sdrs.map((sdr) => ({
    name: sdr.name,
    job: sdr.job,
    teamId,
    imageUrl: sdr.imageUrl,
  }));
  await SDR.insertMany(teamSdr);
}

// Sem acento e em minúsculas: "Vinícius Pereira" → ["vinicius", "pereira"]
const nameParts = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/);

// nome.sobrenome@orcafascio.com (só o nome, se a pessoa não tiver sobrenome)
const personEmail = (name) => {
  const parts = nameParts(name);
  const local =
    parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0];
  return `${local}@orcafascio.com`;
};

// Nome com a primeira letra maiúscula + 123: "Vinícius Pereira" → "Vinicius123"
const personPassword = (name) => {
  const [first] = nameParts(name);
  return `${first.charAt(0).toUpperCase()}${first.slice(1)}123`;
};

// Conta de cada vendedor (perfil vendor) e de cada pessoa de passagem (perfil sdr).
// Só cria o que falta: e-mail já cadastrado ou pessoa que já tem conta ficam como estão
// (nunca troca senha nem perfil). Um erro aqui só avisa, não derruba o seed
async function createPersonUsers() {
  const people = [
    ...seedVendorData.map((vendor) => ({
      role: "vendor",
      field: "vendorId",
      model: Vendors,
      filter: { vendorName: vendor.vendorName },
      name: vendor.vendorName,
    })),
    ...seedSdrData.map((sdr) => ({
      role: "sdr",
      field: "sdrId",
      model: SDR,
      filter: { name: sdr.name },
      name: sdr.name,
    })),
  ];
  let created = 0;

  for (const person of people) {
    try {
      const email = personEmail(person.name);
      const record = await person.model.findOne(person.filter);
      if (!record) continue;

      const exists = await User.exists({
        $or: [{ email }, { [person.field]: record._id }],
      });
      if (exists) continue;

      await User.create({
        email,
        passwordHash: await hashPassword(personPassword(person.name)),
        role: person.role,
        [person.field]: record._id,
      });
      created += 1;
    } catch (err) {
      console.log(`Aviso: conta de ${person.name} não criada (${err.message})`);
    }
  }

  console.log(`Contas de colaboradores criadas: ${created}`);
}

if (require.main === module) {
  runSeed(seedTeamData);
}

module.exports = { personEmail, personPassword };
