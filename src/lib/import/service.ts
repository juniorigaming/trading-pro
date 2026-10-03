/**
 * Persistência da importação: anti-duplicidade por carteira + insert tolerante ao schema de produção.
 * Server-only (usa o banco).
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { normalizePortfolio, PORTFOLIO_META, type PortfolioId } from "@/lib/portfolio";
import { isMissingPortfolioColumn, resilientInsert } from "@/lib/trades-db";
import { resultTypeOf } from "./csv";
import type { ImportedTrade, ImportParseResult } from "./types";

export interface ImportSummary {
  success: boolean;
  format: ImportParseResult["format"];
  portfolio: PortfolioId;
  fileName: string;
  totalRows: number;
  parsed: number;
  imported: number;
  duplicates: number;
  skipped: number;
  dryRun: boolean;
  warnings: string[];
  errors: string[];
  /** até 50 linhas para pré-visualização */
  preview: Array<{ externalId: string; date: string; time: string; asset: string; direction: string; resultAmount: number; duplicate: boolean }>;
  /** colunas que o banco de produção ainda não tem (informativo) */
  droppedColumns: string[];
  message: string;
}

/** Ids já importados nesta carteira (external_id) + tickets legados do v32 gravados em notes. */
export async function existingExternalIds(portfolio: PortfolioId): Promise<{ ids: Set<string>; portfolioColumn: boolean }> {
  const db = getDb();
  const ids = new Set<string>();
  let portfolioColumn = true;
  try {
    const rows = await db.select({ externalId: trades.externalId, notes: trades.notes }).from(trades).where(and(eq(trades.portfolio, portfolio), isNotNull(trades.externalId)));
    for (const r of rows) if (r.externalId) ids.add(r.externalId);
  } catch (e) {
    if (!isMissingPortfolioColumn(e)) throw e;
    portfolioColumn = false;
  }
  // tickets MT5 antigos ("Ticket 123456" em notes) — só fazem sentido em FOREX
  if (portfolio === "FOREX" || !portfolioColumn) {
    try {
      const prev = await db.select({ notes: trades.notes }).from(trades);
      for (const p of prev) { const m = /Ticket\s+(\d+)/.exec(p.notes || ""); if (m) ids.add(m[1]); }
    } catch { /* tabela sem notes */ }
  }
  return { ids, portfolioColumn };
}

function buildRow(t: ImportedTrade, portfolio: PortfolioId): Record<string, unknown> {
  const meta = PORTFOLIO_META[portfolio];
  return {
    date: t.date,
    time: t.time,
    asset: t.asset,
    direction: t.direction,
    session: meta.defaultSession,
    status: "CLOSED",
    portfolio,
    externalId: t.externalId,
    resultAmount: String(t.resultAmount),
    resultType: resultTypeOf(t.resultAmount),
    notes: t.notes,
    entryPrice: t.entryPrice != null ? String(t.entryPrice) : undefined,
    positionSize: t.quantity != null ? String(t.quantity) : undefined,
    exitReason: t.exitPrice != null ? `saída @ ${t.exitPrice}` : undefined,
  };
}

/**
 * Insere as operações. Colunas inexistentes no banco são removidas uma vez e lembradas
 * para as próximas linhas (produção tem a tabela trades defasada).
 */
export async function persistImport(parsed: ImportParseResult, portfolioRaw: string, fileName: string, dryRun: boolean): Promise<ImportSummary> {
  const portfolio = normalizePortfolio(portfolioRaw);
  const { ids: existing, portfolioColumn } = await existingExternalIds(portfolio);
  const warnings = [...parsed.warnings];
  if (!portfolioColumn) warnings.push("A coluna 'portfolio' ainda não existe no banco — rode o SQL drizzle/0003_portfolios.sql no Neon. Até lá tudo é gravado como FOREX.");

  const seenInFile = new Set<string>();
  const preview: ImportSummary["preview"] = [];
  const toInsert: ImportedTrade[] = [];
  let duplicates = 0;
  for (const t of parsed.trades) {
    const dup = existing.has(t.externalId) || seenInFile.has(t.externalId);
    seenInFile.add(t.externalId);
    if (preview.length < 50) preview.push({ externalId: t.externalId, date: t.date.toISOString(), time: t.time, asset: t.asset, direction: t.direction, resultAmount: t.resultAmount, duplicate: dup });
    if (dup) { duplicates++; continue; }
    toInsert.push(t);
  }

  const errors: string[] = [];
  const dropped = new Set<string>();
  let imported = 0;
  if (!dryRun) {
    for (const t of toInsert) {
      try {
        const r = await resilientInsert(buildRow(t, portfolio));
        r.dropped.forEach((d) => dropped.add(d));
        imported++;
      } catch (e) {
        errors.push(`${t.asset} ${t.date.toISOString().slice(0, 10)}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }

  const n = dryRun ? toInsert.length : imported;
  const message = dryRun
    ? `${toInsert.length} nova(s) operação(ões) prontas para importar na carteira ${PORTFOLIO_META[portfolio].label}${duplicates ? ` · ${duplicates} já existiam` : ""}.`
    : n > 0
      ? `${n} operação(ões) importadas na carteira ${PORTFOLIO_META[portfolio].label}!${duplicates ? ` (${duplicates} já existiam e foram ignoradas)` : ""}`
      : duplicates > 0
        ? `Nenhuma nova: as ${duplicates} operações do arquivo já estavam importadas.`
        : parsed.trades.length === 0
          ? `Nenhuma operação encontrada no arquivo.${warnings[0] ? ` ${warnings[0]}` : ""}`
          : `Nenhuma importada. ${errors.slice(0, 2).join(" | ")}`;

  return {
    success: errors.length === 0 || imported > 0,
    format: parsed.format,
    portfolio,
    fileName,
    totalRows: parsed.totalRows,
    parsed: parsed.trades.length,
    imported,
    duplicates,
    skipped: parsed.skipped,
    dryRun,
    warnings,
    errors: errors.slice(0, 5),
    preview,
    droppedColumns: [...dropped],
    message,
  };
}

/** Lê o arquivo do FormData tratando UTF-16 (MT5) e BOM. */
export async function readUploadText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf).replace(/\0/g, "");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buf).replace(/\0/g, "");
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("\0")) {
    const alt = new TextDecoder("utf-16le").decode(buf);
    text = alt.includes("\0") ? text.replace(/\0/g, "") : alt;
  }
  // arquivos ANSI (Windows-1252) do Profit/Clear: "�" indica decodificação errada → tenta latin1
  if (/\uFFFD/.test(text)) {
    try { text = new TextDecoder("windows-1252").decode(buf); } catch { /* mantém */ }
  }
  return text.replace(/\0/g, "");
}
