import type { PortfolioId } from "@/lib/portfolio";

export type ImportFormat = "mt5" | "profit" | "clear" | "binance" | "bybit" | "generic";
export type ImportFormatOrAuto = ImportFormat | "auto";

export const IMPORT_FORMAT_LABEL: Record<ImportFormat, string> = {
  mt5: "MetaTrader 4/5 — relatório HTML (Histórico › Posições)",
  profit: "Profit / Nelogica — CSV (Resumo de operações)",
  clear: "Clear / XP / Rico — CSV de negociações (compras e vendas)",
  binance: "Binance — CSV (Trade History / Transaction History)",
  bybit: "Bybit — CSV (Closed P&L)",
  generic: "CSV genérico (modelo do Trading Pro)",
};

/** Formatos sugeridos por carteira (o auto-detect aceita qualquer um). */
export const FORMATS_BY_PORTFOLIO: Record<PortfolioId, ImportFormat[]> = {
  FOREX: ["mt5", "generic"],
  B3: ["profit", "clear", "generic"],
  CRYPTO: ["binance", "bybit", "generic"],
};

/** Operação normalizada, pronta para virar linha da tabela `trades`. */
export interface ImportedTrade {
  /** ticket / order id / hash determinístico — usado para não duplicar */
  externalId: string;
  /** Date em UTC com os componentes de data/hora do arquivo (mesma convenção do import MT5 v32) */
  date: Date;
  /** HH:MM */
  time: string;
  asset: string;
  direction: "BUY" | "SELL";
  resultAmount: number;
  quantity?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  fees?: number | null;
  notes: string;
}

export interface ImportParseResult {
  format: ImportFormat;
  trades: ImportedTrade[];
  /** linhas lidas no arquivo (antes de filtrar) */
  totalRows: number;
  skipped: number;
  warnings: string[];
}

export interface ParseOptions {
  portfolio: PortfolioId;
  fileName?: string;
}
