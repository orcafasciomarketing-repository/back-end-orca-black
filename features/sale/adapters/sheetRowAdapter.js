// Única parte do sistema que conhece as colunas da planilha.
// Traduz uma linha (enviada pelo Apps Script) para o objeto de venda do sistema.
// Os nomes rd* foram mantidos porque o front do admin lê esses campos.

// "Concluída", "concluida" e " CONCLUÍDA " viram "concluida": ignora acento, maiúscula e espaço
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const SEGMENTS = { b2b: "b2b", b2g: "b2g" };

// Data inválida (texto vazio, texto qualquer) vira null em vez de "Invalid Date"
const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Passagens com várias pessoas: a lista suspensa com várias seleções manda "Ana, Caio"
const toPassageNames = (value) => {
  const names = Array.isArray(value) ? value : String(value ?? "").split(",");
  const trimmedNames = names.map((name) => String(name).trim()).filter(Boolean);

  // Cada pessoa conta uma vez por venda
  return [...new Set(trimmedNames)];
};

exports.translateSheetRow = (row) => {
  const rawValue = row["Valor da venda"];
  const value = rawValue === "" || rawValue === null ? NaN : Number(rawValue);

  return {
    rdDealId: String(row["Id da venda"] ?? "").trim(),
    rdDealName: String(row["Id da empresa"] ?? "").trim(),
    rdUpdatedAt: toDate(row["Atualizado em"]),
    realizedAt: toDate(row["Data da venda"]),
    value,
    vendorName: String(row["Vendedor"] ?? "").trim(),
    rdPassageNames: toPassageNames(row["Passagens"]),
    segment: SEGMENTS[normalize(row["Setor"])] ?? null,
    // Só "Renovação" é farm; venda nova vem sem classificação
    funnelType: normalize(row["Classificação"]) === "renovacao" ? "farm" : "sales",
    // Só "Concluída" conta como venda ativa; "Cancelada" ou qualquer outro status cancela
    isConcluded: normalize(row["Status"]) === "concluida",
    sheetRow: row.linha,
  };
};

// Campos sem os quais a venda não pode ser gravada. Devolve a lista de problemas
exports.findSaleDataErrors = (sale) => {
  const errors = [];
  if (!sale.vendorName) errors.push("Vendedor vazio");
  if (!sale.segment) errors.push("Setor precisa ser B2B ou B2G");
  if (!Number.isFinite(sale.value) || sale.value < 0) errors.push("Valor da venda inválido");
  if (!sale.realizedAt) errors.push("Data da venda inválida");
  return errors;
};
