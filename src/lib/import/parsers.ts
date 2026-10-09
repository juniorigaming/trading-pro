/**
 * Parsers por corretora. Cada um recebe o texto do arquivo e devolve operações normalizadas.
 *  - MT4/MT5  : relatório HTML (tabela "Posições")                 → resultado pronto
 *  - Profit   : CSV "Resumo de operações" (Nelogica)              → resultado pronto
 *  - Clear/XP : CSV de negociações (uma linha por compra/venda)   → casado por preço médio (FIFO)
 *  - Binance  : Trade History Futuros (Realized Profit) · Transaction History (REALIZED_PNL) · Spot Trade History (FIFO)
 *  - Bybit    : Closed P&L                                        → resultado pronto
 *  - Genérico : modelo do Trading Pro                              → resultado pronto
 */
import { cleanSymbol, colIndex, findHeaderRow, normHeader, parseCsv, parseDateTime, parseNumber, stableHash, stripBom } from "./csv";
import { b3PointValue, fillsToTrades, normalizeB3Asset, type Fill } from "./fifo";
import type { ImportedTrade, ImportParseResult } from "./types";

// ---------------------------------------------------------------- MT4 / MT5 (HTML)
function cleanCell(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

/** Lê SOMENTE a tabela "Posições" (fechadas) do relatório MT5 — mesma regra do v32 em produção. */
export function parseMt5HtmlRows(html: string): string[][] {
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const allRows: string[][] = [];
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(cleanHtml)) !== null) {
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) cells.push(cleanCell(tdMatch[1]));
    const nonEmpty = cells.filter((c) => c.length > 0);
    if (nonEmpty.length >= 1) allRows.push(nonEmpty);
  }
  const closedRows: string[][] = [];
  let inClosed = false;
  for (const row of allRows) {
    const lower = row.join(" ").toLowerCase();
    const isHeaderRow = (lower.includes("horário") || lower.includes("horario") || lower.includes("time")) && (lower.includes("ativo") || lower.includes("symbol"));
    const isSectionTitle = row.length === 1 && !/^\d{4}\.\d{2}\.\d{2}/.test(row[0]);
    if (!inClosed) {
      const isPosHeader = isHeaderRow && (lower.includes("position") || lower.includes("posição") || lower.includes("posicao")) && (lower.includes("lucro") || lower.includes("profit")) && !lower.includes("oferta") && !lower.includes("deal") && !lower.includes("ordem") && !lower.includes("estado");
      if (isPosHeader) inClosed = true;
      continue;
    }
    if (isSectionTitle || isHeaderRow) break;
    const hasDate = /^\d{4}\.\d{2}\.\d{2}/.test(row[0] || "");
    const hasSymbol = /^[A-Z0-9._#&-]{3,14}$/i.test(row[2] || "") && /[A-Z]/i.test(row[2] || "");
    const hasType = /^(buy|sell)/i.test(row[3] || "");
    if (hasDate && hasSymbol && hasType) closedRows.push(row);
    else if (!hasDate) break;
  }
  const seen = new Set<string>();
  return closedRows.filter((r) => { const k = r[1]; if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

export function parseMt5(text: string): ImportParseResult {
  const rows = parseMt5HtmlRows(text);
  const trades: ImportedTrade[] = [];
  let skipped = 0;
  const warnings: string[] = [];
  for (const row of rows) {
    const dt = parseDateTime(row[0]);
    if (!dt) { skipped++; continue; }
    const ticket = row[1] || "";
    const symbol = row[2] || "";
    const type = row[3] || "";
    const volume = parseNumber(row[4], "en");
    const entry = parseNumber(row[5], "en");
    const profit = parseNumber(row[row.length - 1], "en") ?? 0;
    const direction: "BUY" | "SELL" = /sell/i.test(type) ? "SELL" : "BUY";
    trades.push({
      externalId: ticket || stableHash(row.join("|")),
      date: dt.date,
      time: dt.time,
      asset: cleanSymbol(symbol),
      direction,
      resultAmount: profit,
      quantity: volume,
      entryPrice: entry,
      notes: `Ticket ${ticket} ${symbol} ${direction} ${profit} mt5`,
    });
  }
  if (rows.length === 0) warnings.push("Nenhuma linha na tabela 'Posições'. Exporte pelo MT5: Histórico › botão direito › Relatório › HTML (Open XML não serve).");
  return { format: "mt5", trades, totalRows: rows.length, skipped, warnings };
}

// ---------------------------------------------------------------- Profit / Nelogica
const PROFIT_HEADERS = ["ativo", "abertura", "fechamento", "lado", "res operacao", "res. operação", "qtd compra", "preco compra"];

export function looksLikeProfit(rows: string[][]): boolean {
  const i = findHeaderRow(rows, PROFIT_HEADERS, 4);
  return i >= 0;
}

export function parseProfit(text: string): ImportParseResult {
  const rows = parseCsv(text);
  const hi = findHeaderRow(rows, PROFIT_HEADERS, 4);
  const warnings: string[] = [];
  if (hi < 0) return { format: "profit", trades: [], totalRows: rows.length, skipped: rows.length, warnings: ["Cabeçalho do Profit não encontrado (esperado: Ativo; Abertura; Fechamento; Lado; Res. Operação...). Exporte em 'Resumo de operações' › Exportar › CSV."] };
  const h = rows[hi];
  const cAsset = colIndex(h, ["ativo", "papel", "symbol"]);
  const cOpen = colIndex(h, ["abertura", "data abertura", "entrada"]);
  const cClose = colIndex(h, ["fechamento", "data fechamento", "saida"]);
  const cSide = colIndex(h, ["lado", "c v", "direcao", "tipo"]);
  const cQtyBuy = colIndex(h, ["qtd compra", "quantidade compra", "qtd c"]);
  const cQtySell = colIndex(h, ["qtd venda", "quantidade venda", "qtd v"]);
  const cQty = colIndex(h, ["quantidade", "qtd", "contratos"]);
  const cPxBuy = colIndex(h, ["preco compra", "preco medio compra", "pm compra"]);
  const cPxSell = colIndex(h, ["preco venda", "preco medio venda", "pm venda"]);
  const cRes = colIndex(h, ["res operacao r", "res operacao", "resultado r", "resultado operacao", "resultado liquido", "resultado", "lucro prejuizo", "total"]);
  const cResPct = colIndex(h, ["res operacao %", "resultado %"]);
  const trades: ImportedTrade[] = [];
  let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 4) { skipped++; continue; }
    const assetRaw = r[cAsset] ?? "";
    if (!assetRaw || /^total/i.test(assetRaw)) { skipped++; continue; }
    const closeDt = parseDateTime(r[cClose]) ?? parseDateTime(r[cOpen]);
    if (!closeDt) { skipped++; continue; }
    const resIdx = cRes >= 0 && cRes !== cResPct ? cRes : -1;
    const result = resIdx >= 0 ? parseNumber(r[resIdx], "pt") : null;
    if (result === null) { skipped++; continue; }
    const sideRaw = (r[cSide] ?? "").toUpperCase();
    const direction: "BUY" | "SELL" = /^(V|S|VENDA|SELL|VENDIDO)/.test(sideRaw) ? "SELL" : "BUY";
    const qty = parseNumber(r[cQty], "pt") ?? parseNumber(r[cQtyBuy], "pt") ?? parseNumber(r[cQtySell], "pt");
    const pxBuy = parseNumber(r[cPxBuy], "pt");
    const pxSell = parseNumber(r[cPxSell], "pt");
    const entry = direction === "BUY" ? pxBuy : pxSell;
    const exit = direction === "BUY" ? pxSell : pxBuy;
    const asset = normalizeB3Asset(cleanSymbol(assetRaw));
    const openDt = parseDateTime(r[cOpen]);
    const idBase = `profit:${assetRaw}:${openDt?.iso ?? ""}:${closeDt.iso}:${qty ?? ""}:${result}`;
    trades.push({
      externalId: `profit:${stableHash(idBase)}`,
      date: closeDt.date,
      time: closeDt.time,
      asset,
      direction,
      resultAmount: result,
      quantity: qty,
      entryPrice: entry,
      exitPrice: exit,
      notes: `Profit ${assetRaw} ${direction}${qty ? ` qtd ${qty}` : ""}${openDt ? ` aberta ${openDt.time}` : ""} ${result}`,
    });
  }
  return { format: "profit", trades, totalRows: rows.length - hi - 1, skipped, warnings };
}

// ---------------------------------------------------------------- Clear / XP / Rico (negociações → FIFO)
const CLEAR_HEADERS = ["data", "ativo", "c/v", "quantidade", "preco", "valor"];

export function looksLikeClear(rows: string[][]): boolean {
  const hi = findHeaderRow(rows, ["c v", "compra venda", "tipo de movimentacao", "lado", "operacao"], 1);
  if (hi < 0) return false;
  const h = rows[hi].map(normHeader).join(" ");
  return /(c v|compra venda|lado|operacao|tipo)/.test(h) && /(papel|ativo|codigo|instrumento|ticker)/.test(h) && /(quantidade|qtd)/.test(h) && /(preco|cotacao)/.test(h);
}

export function parseClear(text: string): ImportParseResult {
  const rows = parseCsv(text);
  const hi = findHeaderRow(rows, [...CLEAR_HEADERS, "papel", "codigo", "lado", "qtd", "cotacao", "data negocio", "data do negocio"], 3);
  if (hi < 0) return { format: "clear", trades: [], totalRows: rows.length, skipped: rows.length, warnings: ["Cabeçalho não reconhecido. Esperado colunas: Data; Ativo/Papel; C/V; Quantidade; Preço (extrato de negociações da Clear/XP/Rico ou da Área do Investidor B3)."] };
  const h = rows[hi];
  const cDate = colIndex(h, ["data negocio", "data do negocio", "data", "data hora", "horario"]);
  const cTime = colIndex(h, ["hora", "horario"]);
  const cAsset = colIndex(h, ["papel", "ativo", "codigo de negociacao", "codigo", "instrumento", "ticker", "produto"]);
  const cSide = colIndex(h, ["c v", "compra venda", "tipo de movimentacao", "lado", "operacao", "tipo"]);
  const cQty = colIndex(h, ["quantidade", "qtd", "contratos"]);
  const cPx = colIndex(h, ["preco", "cotacao", "preco unitario", "preco medio"]);
  const cFee = colIndex(h, ["taxas", "custos", "corretagem", "emolumentos"]);
  const cId = colIndex(h, ["id", "numero", "ordem", "negocio", "nota"]);
  const fills: Fill[] = [];
  let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const dt = parseDateTime(r[cDate]);
    const assetRaw = r[cAsset] ?? "";
    const qty = parseNumber(r[cQty], "pt");
    const px = parseNumber(r[cPx], "pt");
    if (!dt || !assetRaw || !qty || px === null) { skipped++; continue; }
    const sideRaw = (r[cSide] ?? "").toUpperCase();
    const side: "BUY" | "SELL" = /^(V|S|VENDA|SELL|VENDIDO|DEBITO)/.test(sideRaw) ? "SELL" : "BUY";
    const time = cTime >= 0 && /\d{1,2}:\d{2}/.test(r[cTime] ?? "") ? (r[cTime].match(/\d{1,2}:\d{2}/)![0]).padStart(5, "0") : dt.time;
    const asset = normalizeB3Asset(cleanSymbol(assetRaw.split(" ")[0]));
    const idRaw = cId >= 0 ? r[cId] : "";
    fills.push({ id: idRaw || `${i}`, date: dt.date, time, asset, side, quantity: Math.abs(qty), price: px, fee: cFee >= 0 ? Math.abs(parseNumber(r[cFee], "pt") ?? 0) : 0 });
  }
  const { trades, open } = fillsToTrades(fills, { source: "clear", multiplier: b3PointValue });
  const warnings: string[] = [];
  if (open.length) warnings.push(`Posições ainda abertas no fim do arquivo (ignoradas): ${open.join(", ")}`);
  if (fills.length && trades.length === 0) warnings.push("Nenhuma operação fechada: o arquivo só tem compras (ou só vendas). Exporte um período que contenha entrada e saída.");
  return { format: "clear", trades, totalRows: rows.length - hi - 1, skipped, warnings };
}

// ---------------------------------------------------------------- Binance
export function looksLikeBinance(rows: string[][]): boolean {
  const hi = findHeaderRow(rows, ["date utc", "symbol", "realized profit", "pair", "executed", "type", "amount", "asset"], 2);
  if (hi < 0) return false;
  const h = rows[hi].map(normHeader);
  const has = (k: string) => h.some((x) => x.includes(k));
  return has("date utc") || (has("realized profit") && has("symbol")) || (has("pair") && has("executed")) || (has("type") && has("amount") && has("asset") && has("symbol"));
}

export function parseBinance(text: string): ImportParseResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  // (1) Futures Trade History: Date(UTC),Symbol,Side,Price,Quantity,Amount,Fee,Realized Profit,Quote Asset
  let hi = findHeaderRow(rows, ["date utc", "symbol", "side", "price", "quantity", "realized profit"], 4);
  if (hi >= 0 && colIndex(rows[hi], ["realized profit", "realized pnl"]) >= 0) {
    const h = rows[hi];
    const cDate = colIndex(h, ["date utc", "date", "time"]);
    const cSym = colIndex(h, ["symbol"]);
    const cSide = colIndex(h, ["side"]);
    const cPx = colIndex(h, ["price"]);
    const cQty = colIndex(h, ["quantity", "qty"]);
    const cFee = colIndex(h, ["fee"]);
    const cPnl = colIndex(h, ["realized profit", "realized pnl"]);
    // agrega fills da mesma ordem (mesmo símbolo, lado e minuto) em uma operação
    const groups = new Map<string, { date: Date; time: string; asset: string; side: "BUY" | "SELL"; pnl: number; fee: number; qty: number; px: number; n: number }>();
    let skipped = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      const dt = parseDateTime(r[cDate]);
      const sym = cleanSymbol(r[cSym] ?? "");
      if (!dt || !sym) { skipped++; continue; }
      const pnl = parseNumber(r[cPnl], "en") ?? 0;
      const fee = Math.abs(parseNumber(r[cFee], "en") ?? 0);
      const qty = parseNumber(r[cQty], "en") ?? 0;
      const px = parseNumber(r[cPx], "en") ?? 0;
      const side: "BUY" | "SELL" = /sell/i.test(r[cSide] ?? "") ? "SELL" : "BUY";
      if (pnl === 0) { skipped++; continue; } // abertura de posição → sem resultado realizado
      const key = `${sym}|${side}|${dt.iso.slice(0, 16)}`;
      const g = groups.get(key);
      if (g) { g.pnl += pnl; g.fee += fee; g.px = (g.px * g.qty + px * qty) / (g.qty + qty || 1); g.qty += qty; g.n++; }
      else groups.set(key, { date: dt.date, time: dt.time, asset: sym, side, pnl, fee, qty, px, n: 1 });
    }
    const trades: ImportedTrade[] = [...groups.entries()].map(([key, g]) => ({
      externalId: `binance:${stableHash(key)}`,
      date: g.date, time: g.time, asset: g.asset,
      // o fill de fechamento tem lado oposto à posição: Sell fecha um long (BUY)
      direction: g.side === "SELL" ? "BUY" : "SELL",
      resultAmount: Math.round((g.pnl - g.fee) * 100) / 100,
      quantity: g.qty, exitPrice: g.px, fees: Math.round(g.fee * 100) / 100,
      notes: `Binance Futures ${g.asset} fechado por ${g.side} ${g.n} fill(s) PnL ${g.pnl.toFixed(2)} fee ${g.fee.toFixed(4)}`,
    }));
    return { format: "binance", trades, totalRows: rows.length - hi - 1, skipped, warnings };
  }
  // (2) Transaction History: Date(UTC),Type,Amount,Asset,Symbol  (REALIZED_PNL / COMMISSION / FUNDING_FEE)
  hi = findHeaderRow(rows, ["date utc", "type", "amount", "asset", "symbol"], 4);
  if (hi >= 0) {
    const h = rows[hi];
    const cDate = colIndex(h, ["date utc", "date", "time"]);
    const cType = colIndex(h, ["type"]);
    const cAmt = colIndex(h, ["amount"]);
    const cSym = colIndex(h, ["symbol"]);
    const trades: ImportedTrade[] = [];
    let skipped = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      const type = (r[cType] ?? "").toUpperCase();
      if (!/REALIZED_PNL/.test(type)) { skipped++; continue; }
      const dt = parseDateTime(r[cDate]);
      const sym = cleanSymbol(r[cSym] ?? "");
      const amt = parseNumber(r[cAmt], "en");
      if (!dt || !sym || amt === null) { skipped++; continue; }
      trades.push({ externalId: `binance:${stableHash(`${dt.iso}|${sym}|${amt}|${i}`)}`, date: dt.date, time: dt.time, asset: sym, direction: "BUY", resultAmount: amt, notes: `Binance REALIZED_PNL ${sym} ${amt} (direção não informada no extrato)` });
    }
    warnings.push("Transaction History não informa compra/venda — todas as operações foram marcadas como BUY. Para direção correta exporte 'Trade History' (Futuros).");
    return { format: "binance", trades, totalRows: rows.length - hi - 1, skipped, warnings };
  }
  // (3) Spot Trade History: Date(UTC),Pair,Side,Price,Executed,Amount,Fee  → FIFO
  hi = findHeaderRow(rows, ["date utc", "pair", "side", "price", "executed", "amount", "fee"], 4);
  if (hi >= 0) {
    const h = rows[hi];
    const cDate = colIndex(h, ["date utc", "date", "time"]);
    const cPair = colIndex(h, ["pair", "market", "symbol"]);
    const cSide = colIndex(h, ["side"]);
    const cPx = colIndex(h, ["price"]);
    const cExec = colIndex(h, ["executed", "filled", "quantity", "qty"]);
    const cFee = colIndex(h, ["fee"]);
    const fills: Fill[] = [];
    let skipped = 0;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i];
      const dt = parseDateTime(r[cDate]);
      const pair = cleanSymbol(r[cPair] ?? "");
      const px = parseNumber(r[cPx], "en");
      const qty = parseNumber(r[cExec], "en");
      if (!dt || !pair || px === null || !qty) { skipped++; continue; }
      // fee em moeda cotada (USDT) ou em BNB/base: só desconta se vier em USDT/USDC/BUSD
      const feeRaw = r[cFee] ?? "";
      const fee = /USDT|USDC|BUSD|USD/i.test(feeRaw) ? Math.abs(parseNumber(feeRaw, "en") ?? 0) : 0;
      fills.push({ id: `${i}`, date: dt.date, time: dt.time, asset: pair, side: /sell/i.test(r[cSide] ?? "") ? "SELL" : "BUY", quantity: Math.abs(qty), price: px, fee });
    }
    const { trades, open } = fillsToTrades(fills, { source: "binance-spot" });
    if (open.length) warnings.push(`Posições spot ainda em carteira (ignoradas): ${open.join(", ")}`);
    return { format: "binance", trades, totalRows: rows.length - hi - 1, skipped, warnings };
  }
  return { format: "binance", trades: [], totalRows: rows.length, skipped: rows.length, warnings: ["Formato Binance não reconhecido. Use Orders › Trade History (Futuros, com 'Realized Profit'), Transaction History ou Spot Trade History."] };
}

// ---------------------------------------------------------------- Bybit (Closed P&L)
export function looksLikeBybit(rows: string[][]): boolean {
  const hi = findHeaderRow(rows, ["closed p l", "closed pnl", "contracts", "closing direction", "exit price", "entry price"], 2);
  return hi >= 0;
}

export function parseBybit(text: string): ImportParseResult {
  const rows = parseCsv(text);
  const hi = findHeaderRow(rows, ["closed p l", "closed pnl", "contracts", "symbol", "entry price", "exit price", "qty", "closing direction", "trade time"], 3);
  if (hi < 0) return { format: "bybit", trades: [], totalRows: rows.length, skipped: rows.length, warnings: ["Cabeçalho Bybit não encontrado. Exporte em Orders › Closed P&L › Export."] };
  const h = rows[hi];
  const cSym = colIndex(h, ["contracts", "symbol", "market"]);
  const cDir = colIndex(h, ["closing direction", "side", "direction"]);
  const cQty = colIndex(h, ["qty", "quantity", "closed size", "size"]);
  const cEntry = colIndex(h, ["entry price", "avg entry price"]);
  const cExit = colIndex(h, ["exit price", "avg exit price"]);
  const cPnl = colIndex(h, ["closed p l", "closed pnl", "realized p l", "realized pnl", "pnl"]);
  const cTime = colIndex(h, ["trade time", "closed time", "close time", "create time", "time", "date"]);
  const cId = colIndex(h, ["order id", "trade id", "id"]);
  const trades: ImportedTrade[] = [];
  let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const sym = cleanSymbol(r[cSym] ?? "");
    const dt = parseDateTime(r[cTime]);
    const pnl = parseNumber(r[cPnl], "en");
    if (!sym || !dt || pnl === null) { skipped++; continue; }
    const dirRaw = (r[cDir] ?? "").toLowerCase();
    // "Close Long" → posição comprada; "Close Short" → vendida; "Sell" (lado do fechamento) → long
    const direction: "BUY" | "SELL" = /long|buy\s*close|^sell$/.test(dirRaw) ? (/short/.test(dirRaw) ? "SELL" : "BUY") : /short|^buy$/.test(dirRaw) ? "SELL" : "BUY";
    const qty = parseNumber(r[cQty], "en");
    const entry = parseNumber(r[cEntry], "en");
    const exit = parseNumber(r[cExit], "en");
    const idRaw = cId >= 0 ? r[cId] : "";
    trades.push({
      externalId: `bybit:${idRaw || stableHash(`${sym}|${dt.iso}|${qty}|${entry}|${exit}|${pnl}`)}`,
      date: dt.date, time: dt.time, asset: sym, direction, resultAmount: pnl, quantity: qty, entryPrice: entry, exitPrice: exit,
      notes: `Bybit ${sym} ${r[cDir] ?? ""} qtd ${qty ?? "?"} ${entry ?? "?"} → ${exit ?? "?"} PnL ${pnl}`,
    });
  }
  return { format: "bybit", trades, totalRows: rows.length - hi - 1, skipped, warnings: [] };
}

// ---------------------------------------------------------------- Genérico (modelo Trading Pro)
export const GENERIC_TEMPLATE_HEADER = "data,hora,ativo,direcao,quantidade,preco_entrada,preco_saida,resultado,taxas,id_externo,observacoes";
export const GENERIC_TEMPLATE_CSV = `${GENERIC_TEMPLATE_HEADER}
2026-03-10,10:35,WIN,BUY,2,128450,128700,100.00,1.20,nota-001,Exemplo B3 mini indice (resultado em R$)
2026-03-10,14:02,EURUSD,SELL,0.5,1.0850,1.0820,150.00,0,ticket-123,Exemplo Forex (resultado em USD)
2026-03-11,22:15,BTCUSDT,BUY,0.01,67000,66500,-5.00,0.40,ord-987,Exemplo cripto (resultado em USDT)
`;

export function looksLikeGeneric(rows: string[][]): boolean {
  const hi = findHeaderRow(rows, ["data", "date", "ativo", "symbol", "asset", "resultado", "result", "pnl", "profit", "direcao", "direction", "side"], 3);
  return hi >= 0;
}

export function parseGeneric(text: string): ImportParseResult {
  const rows = parseCsv(text);
  const hi = findHeaderRow(rows, ["data", "date", "ativo", "symbol", "asset", "resultado", "result", "pnl", "profit", "direcao", "direction", "side"], 3);
  if (hi < 0) return { format: "generic", trades: [], totalRows: rows.length, skipped: rows.length, warnings: [`Cabeçalho não reconhecido. Baixe o modelo e use as colunas: ${GENERIC_TEMPLATE_HEADER}`] };
  const h = rows[hi];
  const cDate = colIndex(h, ["data", "date", "datetime", "data hora", "close time", "time"]);
  const cTime = colIndex(h, ["hora", "horario", "time"]);
  const cAsset = colIndex(h, ["ativo", "symbol", "asset", "par", "pair", "instrumento", "ticker"]);
  const cDir = colIndex(h, ["direcao", "direction", "side", "lado", "tipo", "type"]);
  const cQty = colIndex(h, ["quantidade", "qtd", "quantity", "qty", "volume", "lots", "size"]);
  const cEntry = colIndex(h, ["preco entrada", "entry price", "entry", "entrada", "open price"]);
  const cExit = colIndex(h, ["preco saida", "exit price", "exit", "saida", "close price"]);
  const cRes = colIndex(h, ["resultado", "result", "pnl", "profit", "lucro", "net", "p l"]);
  const cFee = colIndex(h, ["taxas", "fees", "fee", "commission", "comissao", "custos"]);
  const cId = colIndex(h, ["id externo", "external id", "ticket", "order id", "id"]);
  const cNotes = colIndex(h, ["observacoes", "notes", "obs", "comentario", "comment"]);
  if (cDate < 0 || cAsset < 0 || cRes < 0) return { format: "generic", trades: [], totalRows: rows.length, skipped: rows.length, warnings: [`Faltam colunas obrigatórias (data, ativo, resultado). Cabeçalho lido: ${h.join(", ")}`] };
  const trades: ImportedTrade[] = [];
  let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = cTime >= 0 && cTime !== cDate && r[cTime] && !/\d{1,2}:\d{2}/.test(r[cDate] ?? "") ? `${r[cDate]} ${r[cTime]}` : r[cDate];
    const dt = parseDateTime(dateStr);
    const assetRaw = r[cAsset] ?? "";
    const res = parseNumber(r[cRes], "auto");
    if (!dt || !assetRaw || res === null) { skipped++; continue; }
    const dirRaw = (r[cDir] ?? "").toUpperCase();
    const direction: "BUY" | "SELL" = /^(S|V|SELL|VENDA|SHORT)/.test(dirRaw) ? "SELL" : "BUY";
    const fee = cFee >= 0 ? Math.abs(parseNumber(r[cFee], "auto") ?? 0) : 0;
    const idRaw = cId >= 0 ? (r[cId] ?? "").trim() : "";
    const asset = cleanSymbol(assetRaw);
    trades.push({
      externalId: `csv:${idRaw || stableHash(`${dt.iso}|${asset}|${direction}|${res}|${i}`)}`,
      date: dt.date, time: dt.time, asset, direction,
      resultAmount: Math.round((res - fee) * 100) / 100,
      quantity: cQty >= 0 ? parseNumber(r[cQty], "auto") : null,
      entryPrice: cEntry >= 0 ? parseNumber(r[cEntry], "auto") : null,
      exitPrice: cExit >= 0 ? parseNumber(r[cExit], "auto") : null,
      fees: fee,
      notes: [cNotes >= 0 ? r[cNotes] : "", idRaw ? `id ${idRaw}` : "", "csv"].filter(Boolean).join(" · "),
    });
  }
  return { format: "generic", trades, totalRows: rows.length - hi - 1, skipped, warnings: [] };
}

export function isHtml(text: string): boolean {
  const head = stripBom(text).slice(0, 2000).toLowerCase();
  return head.includes("<html") || head.includes("<table") || head.includes("<!doctype html");
}
