/**
 * Ponto de entrada da importação multi-mercado.
 *   detectFormat(text, fileName) → formato provável
 *   parseImport(text, { format, portfolio, fileName }) → operações normalizadas
 */
import { parseCsv, stripBom } from "./csv";
import { isHtml, looksLikeBinance, looksLikeBybit, looksLikeClear, looksLikeGeneric, looksLikeProfit, parseBinance, parseBybit, parseClear, parseGeneric, parseMt5, parseProfit } from "./parsers";
import type { ImportFormat, ImportFormatOrAuto, ImportParseResult, ParseOptions } from "./types";

export * from "./types";
export { GENERIC_TEMPLATE_CSV, GENERIC_TEMPLATE_HEADER } from "./parsers";
export { parseCsv, parseNumber, parseDateTime } from "./csv";
export { fillsToTrades, b3PointValue, normalizeB3Asset } from "./fifo";

export function detectFormat(textRaw: string, fileName = ""): ImportFormat | null {
  const text = stripBom(textRaw);
  if (isHtml(text)) return "mt5";
  const lower = fileName.toLowerCase();
  const rows = parseCsv(text).slice(0, 60);
  if (rows.length === 0) return null;
  if (looksLikeBybit(rows)) return "bybit";
  if (looksLikeBinance(rows)) return "binance";
  if (looksLikeProfit(rows)) return "profit";
  if (looksLikeClear(rows)) return "clear";
  if (looksLikeGeneric(rows)) return "generic";
  if (/bybit/.test(lower)) return "bybit";
  if (/binance/.test(lower)) return "binance";
  if (/profit|nelogica/.test(lower)) return "profit";
  if (/clear|xp|rico/.test(lower)) return "clear";
  return null;
}

export function parseImport(textRaw: string, opts: ParseOptions & { format?: ImportFormatOrAuto }): ImportParseResult {
  const text = stripBom(textRaw);
  const format: ImportFormat | null = !opts.format || opts.format === "auto" ? detectFormat(text, opts.fileName) : opts.format;
  if (!format) {
    return { format: "generic", trades: [], totalRows: 0, skipped: 0, warnings: ["Não consegui identificar o formato do arquivo. Escolha o formato manualmente ou use o CSV genérico (modelo disponível para download)."] };
  }
  let result: ImportParseResult;
  switch (format) {
    case "mt5": result = parseMt5(text); break;
    case "profit": result = parseProfit(text); break;
    case "clear": result = parseClear(text); break;
    case "binance": result = parseBinance(text); break;
    case "bybit": result = parseBybit(text); break;
    default: result = parseGeneric(text);
  }
  // Garante que todo externalId carregue a carteira (o mesmo ticket pode existir em carteiras diferentes)
  result.trades = result.trades.map((t) => ({ ...t, asset: t.asset || "N/A", externalId: t.externalId.trim() }));
  return result;
}
