/**
 * Carteiras multi-mercado (Forex · B3 · Cripto).
 * Módulo compartilhado entre client e server: NÃO importar banco aqui.
 */
export const PORTFOLIOS = ["FOREX", "B3", "CRYPTO"] as const;
export type PortfolioId = (typeof PORTFOLIOS)[number];

export const DEFAULT_PORTFOLIO: PortfolioId = "FOREX";
export const PORTFOLIO_STORAGE_KEY = "tp.portfolio";
export const PORTFOLIO_EVENT = "tp:portfolio-change";

export interface PortfolioMeta {
  id: PortfolioId;
  label: string;
  short: string;
  description: string;
  currency: "USD" | "BRL" | "USDT";
  currencySymbol: string;
  /** Sessões sugeridas no formulário de operação */
  sessions: string[];
  defaultSession: string;
  defaultAsset: string;
  /** Grupos de ativos exibidos primeiro no formulário */
  assetGroups: string[];
  /** Cor de destaque (classes Tailwind existentes no projeto) */
  accent: { text: string; bg: string; border: string; dot: string };
  brokers: string[];
}

export const PORTFOLIO_META: Record<PortfolioId, PortfolioMeta> = {
  FOREX: {
    id: "FOREX",
    label: "Forex",
    short: "FX",
    description: "Pares de moedas, metais e índices via MT4/MT5",
    currency: "USD",
    currencySymbol: "$",
    sessions: ["Ásia", "Londres", "Nova York", "Outro"],
    defaultSession: "Nova York",
    defaultAsset: "EURUSD",
    assetGroups: ["FOREX - Pares Maiores", "FOREX - Cruzados & Metais", "FUTUROS - EUA", "AÇÕES & ÍNDICES - EUA"],
    accent: { text: "text-emerald", bg: "bg-emerald/10", border: "border-emerald/30", dot: "bg-emerald" },
    brokers: ["MetaTrader 5 (HTML)", "MetaTrader 4 (HTML)", "CSV genérico"],
  },
  B3: {
    id: "B3",
    label: "B3",
    short: "B3",
    description: "Mini índice, mini dólar e ações da bolsa brasileira",
    currency: "BRL",
    currencySymbol: "R$",
    sessions: ["B3 - Abertura", "B3 - Pregão", "B3 - Fechamento", "B3 - After", "Outro"],
    defaultSession: "B3 - Pregão",
    defaultAsset: "WIN",
    assetGroups: ["B3 - Índices e Dólar", "B3 - Ações"],
    accent: { text: "text-amber", bg: "bg-amber/10", border: "border-amber/30", dot: "bg-amber" },
    brokers: ["Profit / Nelogica (CSV)", "Clear / XP / Rico (CSV)", "CSV genérico"],
  },
  CRYPTO: {
    id: "CRYPTO",
    label: "Cripto",
    short: "CR",
    description: "Spot e futuros perpétuos em exchanges",
    currency: "USDT",
    currencySymbol: "₮",
    sessions: ["Cripto 24h", "Ásia", "Londres", "Nova York", "Outro"],
    defaultSession: "Cripto 24h",
    defaultAsset: "BTCUSDT",
    assetGroups: ["CRIPTO - Principais", "CRIPTO - BRL"],
    accent: { text: "text-sky", bg: "bg-sky/10", border: "border-sky/30", dot: "bg-sky" },
    brokers: ["Binance (CSV)", "Bybit (CSV)", "CSV genérico"],
  },
};

export function isPortfolioId(v: unknown): v is PortfolioId {
  return typeof v === "string" && (PORTFOLIOS as readonly string[]).includes(v);
}

/** Normaliza qualquer entrada (query, body, localStorage) para um id válido. */
export function normalizePortfolio(v: unknown, fallback: PortfolioId = DEFAULT_PORTFOLIO): PortfolioId {
  if (typeof v !== "string") return fallback;
  const up = v.trim().toUpperCase();
  if (up === "CRIPTO" || up === "CRYPTO") return "CRYPTO";
  if (up === "B3" || up === "BOVESPA") return "B3";
  if (up === "FOREX" || up === "FX") return "FOREX";
  return fallback;
}

/** Chave usada na tabela `config` para cada carteira (FOREX mantém a chave legada "settings"). */
export function configKeyFor(p: PortfolioId): string {
  return p === "FOREX" ? "settings" : `settings:${p}`;
}

/** Lê a carteira ativa salva no navegador (seguro em SSR). */
export function readStoredPortfolio(): PortfolioId {
  if (typeof window === "undefined") return DEFAULT_PORTFOLIO;
  try {
    return normalizePortfolio(window.localStorage.getItem(PORTFOLIO_STORAGE_KEY));
  } catch {
    return DEFAULT_PORTFOLIO;
  }
}

/** Persiste e notifica todos os hooks montados (mesma aba) sobre a troca. */
export function writeStoredPortfolio(p: PortfolioId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, p);
  } catch {
    /* modo privado / storage cheio: segue só em memória */
  }
  window.dispatchEvent(new CustomEvent(PORTFOLIO_EVENT, { detail: p }));
}

/** Deduz a carteira pelo símbolo (usado na importação genérica e como sugestão no formulário). */
export function guessPortfolioFromSymbol(symbolRaw: string): PortfolioId {
  const s = symbolRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return DEFAULT_PORTFOLIO;
  if (/^(WIN|WDO|IND|DOL|BIT|BGI|CCM|ICF|SJC|DI1|ISP|WSP)[A-Z]?\d{0,2}$/.test(s) || /^(WIN|WDO|IND|DOL)FUT$/.test(s)) return "B3";
  if (/^[A-Z]{4}(3|4|5|6|11|33|34)F?$/.test(s)) return "B3"; // PETR4, VALE3, BOVA11, ITSA4F
  if (/(USDT|USDC|BUSD|PERP)$/.test(s) || /^(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|LINK|LTC|DOT|MATIC|TRX|TON|SHIB|PEPE|SUI|APT|ARB|OP)(USD|BRL|EUR)?$/.test(s)) return "CRYPTO";
  return "FOREX";
}
