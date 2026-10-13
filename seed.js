require("dotenv").config();

const mongoose = require("mongoose");

const Teams = require("./features/teams/model/teamsModel");
const Vendors = require("./features/vendors/model/vendorsModel");
const SDR = require("./features/sdr/model/sdrModel");

const MONGO_URI = process.env.MONGO_URI;

const seedTeamData = [
  {
    name: "Wizards of sales",
    imageUrl: "http://192.168.1.22:3000/public/camiseta_amarela.png",
  },
  {
    name: "Orçawinx",
    imageUrl: "http://192.168.1.22:3000/public/camiseta_verde.png",
  },
  {
    name: "Sem freio",
    imageUrl: "http://192.168.1.22:3000/public/camiseta_azul.png",
  },
];
const seedVendorData = [
  {
    vendorName: "Joice Pereira",
    rdUserId: "69a187e608c9d00015e148c3",
    job: "B2G Farmer",
    teamName: "Wizards of sales",
  },
  {
    vendorNameame: "Renan Souza",
    rdUserId: "69a59e77489a750013588135",
    job: "B2B Farmer",
    teamName: "Orçawinx",
  },
  {
    vendorName: "Giovana Evaristo",
    rdUserId: "69a59dc6b8f0cd001c9b6167",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
  },
  {
    vendorName: "Rayssa Souza",
    rdUserId: "698b8d1b1ce949001ac2c88b",
    job: "B2B Venda",
    teamName: "Wizards of sales",
  },
  {
    vendorName: "Danne Albuqerque",
    rdUserId: "632cf85b356f19000c64f466",
    job: "B2B Farmer",
    teamName: "Orçawinx",
  },
  {
    vendorName: "Nicolly Vilella",
    rdUserId: "69a59de6a261e400164a77cd",
    job: "B2B Farmer",
    teamName: "Orçawinx",
  },
  {
    vendorName: "Samuel Pacheco",
    rdUserId: "69a59e2fc641030019e4e881",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
  },
  {
    vendorName: "Maria Bezerra",
    rdUserId: "69a0a37d29b9c80012fa9aed",
    job: "B2B Farmer",
    teamName: "Wizards of sales",
  },
  {
    vendorName: "Brenda Florêncio",
    rdUserId: "69a598336480fa0016aa1961",
    job: "B2B Venda",
    teamName: "Sem Freio",
  },
  {
    vendorName: "Victoria Amaral",
    rdUserId: "69a597f2d9a07d001362388f",
    job: "B2B Venda",
    teamName: "Orçawinx",
  },
  {
    vendorName: "Heitor Santinon",
    rdUserId: "69a0a0fea2bf0000178bed39",
    job: "B2G Venda",
    teamName: "Sem freio",
  },
  {
    vendorName: "Roberta Campos",
    rdUserId: "6a9737c243fd3e0029f21c29",
    job: "B2B Farmer",
    teamName: "Sem freio",
  },
  {
    vendorName: "Sabrina Oliveira",
    rdUserId: "69a59dbf25bbed0016c4647a",
    job: "B2B Farmer",
    teamName: "Sem freio",
  },
  {
    vendorName: "Marcelo Brandi",
    rdUserId: "69a59e50b8f0cd00169b600d",
    job: "B2B Farmer",
    teamName: "Sem freio",
  },
  {
    vendorName: "Wagner Camillo",
    rdUserId: "69a0a147799e1e0013c3d027",
    job: "B2G Farmer",
    teamName: "Sem freio",
  },
  {
    vendorName: "Jullya Freitas",
    rdUserId: "69a59860f5fa7900159ab15c",
    job: "B2B Venda",
    teamName: "Orçawinx",
  },
  {
    vendorName: "Jonathan",
    rdUserId: "69a0ade3db22f3001f7b72d3",
    job: "B2G Venda",
    teamName: "Wizards of sales",
  },
];

const seedSdrData = [
  {
    name: "Victor Batilochi",
    job: "B2B SDR",
    teamName: "Sem freio",
  },
  {
    name: "Gabriel Rinaldo",
    job: "CS",
    teamName: "Wizards of sales",
  },
  {
    name: "Fernanda Prado",
    job: "B2B SDR",
    teamName: "Orçawinx",
  },
  {
    name: "Julia Barrau",
    job: "Suporte",
    teamName: "Orçawinx",
  },
  {
    name: "Caio Cezar",
    job: "CS",
    teamName: "Orçawinx",
  },
  {
    name: "Matheus Vicente",

    job: "B2B SDR",
    teamName: "Orçawinx",
  },
  {
    name: "Julia Tomaz",
    job: "Suporte",
    teamName: "Wizards of sales",
  },

  {
    name: "Giovanni Reis",
    job: "CS",
    teamName: "Sem freio",
  },
  {
    name: "Ana Clara",
    job: "B2B SDR",
    teamName: "Orçawinx",
  },
  {
    name: "Vinícius Pereira",
    job: "B2B SDR",
    teamName: "Wizards of sales",
  },
  {
    name: "Leticia Ferreira",
    job: "Suporte",
    teamName: "Sem freio",
  },
];

async function createTeams(data) {
  try {
    await mongoose.connect(MONGO_URI);

    await Teams.deleteMany({});
    await Vendors.deleteMany({});
    await SDR.deleteMany({});

    console.log(
      "Conexão criada e tabela do time, dos vendedores e sdr limpas com sucesso",
    );

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
  } catch (err) {
    console.log(`Error: ${err}`);
  } finally {
    mongoose.connection.close();
    console.log("Conexão fechada.");
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

createTeams(seedTeamData);
