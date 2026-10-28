// Apps Script da planilha de vendas (Google Sheets → backend).
// Cópia versionada: o script que roda de verdade fica em Extensões → Apps Script na planilha.
// Ao mudar lá, atualize aqui (e vice-versa).
//
// Instalação:
// 1. Cole este código no editor do Apps Script da planilha e preencha URL_ENDPOINT
//    (https://<backend no Render>/sales/webhook/sheet).
// 2. Em Configurações do projeto → Propriedades do script → WEBHOOK_SECRET,
//    coloque o mesmo valor do WEBHOOK_SECRET do backend (Render).
// 3. Acionadores: aoEditarPlanilha (Da planilha, Ao editar) e sincronizarTudo (Baseado no tempo, a cada 10 minutos).
//
// Regras para quem usa a planilha:
// - Nunca apagar linha de venda: para cancelar, mude o Status para "Cancelada".
// - Não editar a coluna "Id da venda" (ocultar ou proteger a coluna).
// - Passagens: lista suspensa com "Permitir várias seleções" (chega no backend como "Ana, Caio").

// ===== CONFIGURAÇÃO: ajuste aqui =====
const CONFIG = {
  ABA_ORIGEM: "Vendas Gerais",
  LINHA_CABECALHO: 1,
  NOME_COLUNA_STATUS: "Status",
  NOME_COLUNA_ID: "Id da venda",
  STATUS_VENDA_CONCLUIDA: "Concluída",
  URL_ENDPOINT: "COLE_AQUI_A_URL_DO_SEU_ENDPOINT",
  TAMANHO_LOTE: 50,
};

// O segredo NÃO fica no código: Configurações do projeto → Propriedades do script
// → WEBHOOK_SECRET (mesmo valor do WEBHOOK_SECRET do backend)
function lerSegredo() {
  const segredo =
    PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  if (!segredo) throw new Error("Propriedade WEBHOOK_SECRET não configurada");
  return segredo;
}

// Acionador instalável "Ao editar": envia as linhas editadas
function aoEditarPlanilha(e) {
  if (!e || !e.range) return;

  const aba = e.range.getSheet();
  if (aba.getName() !== CONFIG.ABA_ORIGEM) return;

  const linhaInicio = Math.max(e.range.getRow(), CONFIG.LINHA_CABECALHO + 1);
  const linhaFim = e.range.getLastRow();
  if (linhaFim < linhaInicio) return;

  // Duas edições ao mesmo tempo não podem gerar dois ids para a mesma linha
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const vendas = montarVendas(aba, linhaInicio, linhaFim, true);
    enviarVendas(vendas);
  } finally {
    trava.releaseLock();
  }
}

// Acionador de tempo (a cada 10 min): reenvia a planilha inteira.
// Rede de segurança: corrige o que se perdeu se o backend estava fora do ar
function sincronizarTudo() {
  const aba = SpreadsheetApp.getActive().getSheetByName(CONFIG.ABA_ORIGEM);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha <= CONFIG.LINHA_CABECALHO) return;

  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const vendas = montarVendas(
      aba,
      CONFIG.LINHA_CABECALHO + 1,
      ultimaLinha,
      false,
    );
    enviarVendas(vendas);
  } finally {
    trava.releaseLock();
  }
}

// Lê as linhas e devolve as que o backend precisa receber
function montarVendas(aba, linhaInicio, linhaFim, corrigirIdsCopiados) {
  const cabecalhos = lerCabecalhos(aba);

  const colunaStatus = cabecalhos.indexOf(CONFIG.NOME_COLUNA_STATUS);
  if (colunaStatus === -1) {
    console.error(
      `Coluna "${CONFIG.NOME_COLUNA_STATUS}" não encontrada no cabeçalho`,
    );
    return [];
  }
  const colunaId = garantirColunaId(aba, cabecalhos);

  // Ids que já existem fora das linhas editadas (para achar linhas copiadas e coladas)
  const idsForaDaEdicao = corrigirIdsCopiados
    ? lerIdsForaDoIntervalo(aba, colunaId, linhaInicio, linhaFim)
    : new Set();

  const linhas = aba
    .getRange(linhaInicio, 1, linhaFim - linhaInicio + 1, cabecalhos.length)
    .getValues();

  // Momento do envio: o backend usa para ignorar edições que chegarem atrasadas
  const atualizadoEm = new Date().toISOString();
  const vendas = [];

  linhas.forEach((valores, i) => {
    const numeroLinha = linhaInicio + i;
    const concluida =
      String(valores[colunaStatus]).trim() === CONFIG.STATUS_VENDA_CONCLUIDA;
    let id = String(valores[colunaId]).trim();

    // Linha que nunca foi venda concluída não interessa ao sistema
    if (!concluida && !id) return;

    // Linha colada com o id de outra linha: ganha um id novo, senão sobrescreveria a outra venda
    if (id && idsForaDaEdicao.has(id)) id = "";

    // Primeira vez como concluída: gera o id único da venda e grava na planilha
    if (!id) {
      id = Utilities.getUuid();
      aba.getRange(numeroLinha, colunaId + 1).setValue(id);
    }

    const venda = { linha: numeroLinha, "Atualizado em": atualizadoEm };
    cabecalhos.forEach((nome, j) => {
      if (nome) venda[nome] = valores[j];
    });
    venda[CONFIG.NOME_COLUNA_ID] = id;

    vendas.push(venda);
  });

  return vendas;
}

function lerCabecalhos(aba) {
  return aba
    .getRange(CONFIG.LINHA_CABECALHO, 1, 1, aba.getLastColumn())
    .getValues()[0]
    .map((nome) => String(nome).trim());
}

// Cria a coluna "Id da venda" no fim do cabeçalho, se ainda não existir
function garantirColunaId(aba, cabecalhos) {
  let coluna = cabecalhos.indexOf(CONFIG.NOME_COLUNA_ID);
  if (coluna === -1) {
    coluna = cabecalhos.length;
    aba
      .getRange(CONFIG.LINHA_CABECALHO, coluna + 1)
      .setValue(CONFIG.NOME_COLUNA_ID);
    cabecalhos.push(CONFIG.NOME_COLUNA_ID);
  }
  return coluna;
}

function lerIdsForaDoIntervalo(aba, colunaId, linhaInicio, linhaFim) {
  const primeiraLinha = CONFIG.LINHA_CABECALHO + 1;
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha < primeiraLinha) return new Set();

  const ids = new Set();
  aba
    .getRange(primeiraLinha, colunaId + 1, ultimaLinha - primeiraLinha + 1, 1)
    .getValues()
    .forEach(([id], i) => {
      const numeroLinha = primeiraLinha + i;
      const dentroDaEdicao =
        numeroLinha >= linhaInicio && numeroLinha <= linhaFim;
      if (id && !dentroDaEdicao) ids.add(String(id).trim());
    });
  return ids;
}

// Envia em lotes: uma requisição por lote, não uma por linha
function enviarVendas(vendas) {
  for (let i = 0; i < vendas.length; i += CONFIG.TAMANHO_LOTE) {
    enviarLote(vendas.slice(i, i + CONFIG.TAMANHO_LOTE));
  }
}

function enviarLote(lote) {
  const linhas = lote.map((venda) => venda.linha).join(", ");
  try {
    const resposta = UrlFetchApp.fetch(CONFIG.URL_ENDPOINT, {
      method: "post",
      contentType: "application/json",
      // Hash do segredo no header: o backend recusa (401) envios sem ele
      headers: { webhook_secret: lerSegredo() },
      payload: JSON.stringify(lote),
      muteHttpExceptions: true,
    });

    const codigo = resposta.getResponseCode();
    if (codigo >= 200 && codigo < 300) {
      console.log(
        `Linhas ${linhas} enviadas (HTTP ${codigo}): ${resposta.getContentText()}`,
      );
    } else {
      console.error(
        `Falha nas linhas ${linhas}: HTTP ${codigo} - ${resposta.getContentText()}`,
      );
    }
  } catch (erro) {
    console.error(`Erro de rede nas linhas ${linhas}: ${erro}`);
  }
}
