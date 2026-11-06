// Lê o CSV da importação (baixado do Sheets ou do Excel) e devolve as linhas no
// mesmo formato que o Apps Script manda: chaves com o nome das colunas e "linha".
// Assim a importação usa o mesmo translateSheetRow da planilha.

// Diferença do horário de São Paulo para o UTC (o Brasil não tem mais horário de verão)
const SAO_PAULO_OFFSET = "-03:00";

// Excel em português separa por ";", o Sheets por ",": vale o que aparecer mais no cabeçalho
const detectDelimiter = (text) => {
  const headerLine = text.split(/\r?\n/, 1)[0];
  const semicolons = headerLine.split(";").length;
  const commas = headerLine.split(",").length;
  return semicolons > commas ? ";" : ",";
};

// CSV com aspas: "Ana, Caio" é uma célula só e "" dentro das aspas é uma aspa
const parseRecords = (text, delimiter) => {
  const records = [];
  let record = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
    } else if (char === delimiter) {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // \r\n (Windows) conta como uma quebra só
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
};

// "R$ 1.234,56" → 1234.56 | "1.234" → 1234 | "1234.56" → 1234.56 | vazio → NaN
const toNumber = (value) => {
  const text = String(value ?? "").replace(/R\$/i, "").replace(/\s/g, "");
  if (!text) return NaN;

  // Com vírgula: formato brasileiro (ponto é milhar, vírgula é decimal)
  if (text.includes(",")) return Number(text.replace(/\./g, "").replace(",", "."));
  // Só pontos de milhar, sem decimal ("1.234.567")
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ""));
  return Number(text);
};

// "27/11/2026" ou "27/11/2026 14:30" → data no horário de São Paulo.
// Outro formato (ex.: ISO "2026-11-27") segue como veio e o translateSheetRow valida
const toDateText = (value) => {
  const text = String(value ?? "").trim();
  const match = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return text;

  const [, day, month, year, hour = "0", minute = "00", second = "00"] = match;
  const pad = (number) => String(number).padStart(2, "0");
  const isoText = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${minute}:${second}${SAO_PAULO_OFFSET}`;

  // 31/02 vira 03/03 no new Date: confere se o dia e o mês continuam os digitados
  const date = new Date(isoText);
  const saoPauloDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const isSameDay =
    saoPauloDate.getUTCDate() === Number(day) &&
    saoPauloDate.getUTCMonth() + 1 === Number(month);
  return isSameDay ? isoText : "";
};

// Devolve os nomes das colunas e as linhas. Linhas totalmente vazias são descartadas
// (o Sheets costuma exportar ",,,," no fim). "linha" é o número da linha no arquivo,
// contando o cabeçalho como 1, igual à numeração da planilha
exports.parseCsv = (text) => {
  // Excel salva CSV com BOM no começo, que grudaria no nome da primeira coluna
  const cleanText = String(text ?? "").replace(/^﻿/, "");
  const [headerRecord = [], ...dataRecords] = parseRecords(
    cleanText,
    detectDelimiter(cleanText),
  );
  const headers = headerRecord.map((name) => name.trim());

  const rows = [];
  dataRecords.forEach((record, i) => {
    if (record.every((cell) => cell.trim() === "")) return;

    const row = { linha: i + 2 };
    headers.forEach((name, j) => {
      if (name) row[name] = (record[j] ?? "").trim();
    });
    rows.push(row);
  });

  return { headers, rows };
};

// Converte valor e data do texto do CSV para o que o translateSheetRow espera.
// Sem coluna Status no arquivo, toda linha conta como venda concluída
exports.toSheetRow = (row, hasStatusColumn) => ({
  ...row,
  "Valor da venda": toNumber(row["Valor da venda"]),
  "Data da venda": toDateText(row["Data da venda"]),
  ...(!hasStatusColumn && { Status: "Concluída" }),
});
