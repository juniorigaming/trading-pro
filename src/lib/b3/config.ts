/**
 * Configuração central do módulo B3 (pesos, limiares, contratos DI).
 * Pesos editáveis via b3_settings(key='weights'); contratos DI via b3_settings(key='di_contracts').
 * Nada de vencimento hardcoded na lógica: o código só conhece SHORT/MID/LONG.
 */
import type { BrlComponentKey, DiTenor, WinComponentKey } from "./types";

export interface B3Config {
  version: string;
  win_weights: Record<WinComponentKey, number>;
  brl_weights: Record<BrlComponentKey, number>;
  /** score final: passo e limite */
  score_step: number;
  clamp: number;
  /** |score| ≥ bias_threshold ⇒ BULLISH/BEARISH */
  bias_threshold: number;
  /** DOL: |divergência| mínima para candidato */
  dol_min_divergence: number;
  /** WIN: |score| mínimo para candidato */
  win_min_score: number;
  /** cobertura mínima de dados (fração do peso) para o score não ser rebaixado a LOW */
  min_coverage_for_medium: number;
  min_coverage_for_high: number;
  /** variação diária (%) considerada "movimento" para índices/commodities/DXY */
  market_move_pct: { small: number; large: number };
  /** variação (bp) considerada movimento na curva DI / yields */
  rate_move_bp: { small: number; large: number };
  /** fluxo estrangeiro (R$ mi) — limiares para INFLOW/OUTFLOW */
  flow_threshold_brl_mi: number;
  /** horas após as quais um snapshot de mercado é considerado velho (não entra no score) */
  market_stale_hours: number;
  event_risk_horizon_hours: number;
}

export const DEFAULT_B3_CONFIG: B3Config = {
  version: "b3-v1",
  win_weights: {
    BRAZIL_ACTIVITY: 0.8, BRAZIL_INFLATION: 0.7, BCB_POLICY: 1.0, DI_CURVE: 1.1, FISCAL_RISK: 1.0, BRL: 0.7, FOREIGN_FLOW: 0.9,
    US_EQUITIES: 1.1, US_YIELDS: 0.8, DXY: 0.6, CHINA: 0.6, IRON_ORE: 0.7, OIL: 0.5, GLOBAL_RISK_SENTIMENT: 0.9,
  },
  brl_weights: {
    BCB_POLICY: 1.0, BRAZIL_INFLATION: 0.7, BRAZIL_ACTIVITY: 0.6, FISCAL_RISK: 1.1, DI_CURVE: 0.8, FOREIGN_FLOW: 0.9, COMMODITIES: 0.7, CHINA: 0.5, CARRY: 0.6, GLOBAL_RISK_SENTIMENT: 0.9, USD_PRESSURE: 0.5,
  },
  score_step: 0.25,
  clamp: 2.0,
  bias_threshold: 0.5,
  dol_min_divergence: 1.0,
  win_min_score: 0.75,
  min_coverage_for_medium: 0.35,
  min_coverage_for_high: 0.6,
  market_move_pct: { small: 0.3, large: 1.0 },
  rate_move_bp: { small: 4, large: 12 },
  flow_threshold_brl_mi: 500,
  market_stale_hours: 30,
  event_risk_horizon_hours: 12,
};

export interface DiContractConfig { code: string; tenor: DiTenor }
export const DEFAULT_DI_CONTRACTS: DiContractConfig[] = [
  { code: "DI1F27", tenor: "SHORT" }, { code: "DI1F29", tenor: "MID" }, { code: "DI1F31", tenor: "LONG" },
];

export function mergeB3Config(partial: Partial<B3Config> | null | undefined): B3Config {
  if (!partial) return DEFAULT_B3_CONFIG;
  const d = DEFAULT_B3_CONFIG;
  return {
    ...d, ...partial,
    win_weights: { ...d.win_weights, ...(partial.win_weights ?? {}) },
    brl_weights: { ...d.brl_weights, ...(partial.brl_weights ?? {}) },
    market_move_pct: { ...d.market_move_pct, ...(partial.market_move_pct ?? {}) },
    rate_move_bp: { ...d.rate_move_bp, ...(partial.rate_move_bp ?? {}) },
  };
}

/** Palavras-chave de eventos-chave do calendário de risco B3 (spec item 14). */
export const B3_KEY_EVENTS: { re: RegExp; label: string; currency: "BRL" | "USD" | "CNY" }[] = [
  { re: /copom|selic|bcb|banco central|interest rate decision/i, label: "COPOM", currency: "BRL" },
  { re: /ipca-?15/i, label: "IPCA-15", currency: "BRL" },
  { re: /ipca/i, label: "IPCA", currency: "BRL" },
  { re: /pib|gdp/i, label: "PIB", currency: "BRL" },
  { re: /caged/i, label: "CAGED", currency: "BRL" },
  { re: /non-?farm|nfp|payroll/i, label: "NFP", currency: "USD" },
  { re: /\bcpi\b/i, label: "CPI EUA", currency: "USD" },
  { re: /\bpce\b/i, label: "PCE", currency: "USD" },
  { re: /fomc|federal funds|fed (chair|rate)/i, label: "FOMC", currency: "USD" },
  { re: /jolts/i, label: "JOLTS", currency: "USD" },
  { re: /retail sales/i, label: "Retail Sales", currency: "USD" },
  { re: /\bism\b/i, label: "ISM", currency: "USD" },
  { re: /gdp/i, label: "PIB EUA", currency: "USD" },
  { re: /pmi/i, label: "China PMI", currency: "CNY" },
  { re: /speaks|speech|discurso|testif/i, label: "Discurso BC", currency: "USD" },
];
