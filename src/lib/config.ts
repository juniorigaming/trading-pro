import { getDb } from "@/db";
import { config } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Config } from "./types";
import { configKeyFor, normalizePortfolio, PORTFOLIO_META, type PortfolioId } from "./portfolio";

export const DEFAULT_CONFIG: Config = {
  accountName: "Minha Conta",
  initialCapital: 10000,
  riskPerTrade: 250,
  riskPercent: 2.5,
  dailyGoal: 500,
  dailyLossLimit: 350,
  maxDrawdown: 15,
  currency: "USD",
  sessionAsiaStart: "21:00",
  sessionAsiaEnd: "01:00",
  sessionLondonStart: "03:00",
  sessionLondonEnd: "06:00",
  sessionNYStart: "08:00",
  sessionNYEnd: "13:00",
  totalDeposits: 0,
  totalWithdrawals: 0,
  weeklyRiskLimit: 5,
  monthlyDrawdownLimit: 10,
  maxOpenRisk: 2,
  maxCorrelatedExposure: 3,
  maxTradesPerDay: 5,
  sampleSizeWarning: 30,
  sampleSizeLow: 10,
  theme: "system",
  accentColor: "green",
  density: "comfortable",
};

const CONFIG_KEY = "settings";

/** Valores iniciais das carteiras novas: nascem zeradas, na moeda do mercado. */
export function defaultConfigFor(p: PortfolioId): Config {
  if (p === "FOREX") return DEFAULT_CONFIG;
  const meta = PORTFOLIO_META[p];
  return {
    ...DEFAULT_CONFIG,
    accountName: `Carteira ${meta.label}`,
    currency: meta.currency,
    initialCapital: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    riskPerTrade: 0,
    dailyGoal: 0,
    dailyLossLimit: 0,
  };
}

const NUMERIC_KEYS = [
  "initialCapital",
  "riskPerTrade",
  "riskPercent",
  "dailyGoal",
  "dailyLossLimit",
  "maxDrawdown",
  "totalDeposits",
  "totalWithdrawals",
  "weeklyRiskLimit",
  "monthlyDrawdownLimit",
  "maxOpenRisk",
  "maxCorrelatedExposure",
  "maxTradesPerDay",
  "sampleSizeWarning",
  "sampleSizeLow",
] as const;

// Coerce numeric fields: values may have been saved as strings from form inputs.
export function normalizeConfig(raw: Partial<Config>, base: Config = DEFAULT_CONFIG): Config {
  const merged: Record<string, unknown> = { ...base, ...raw };
  for (const key of NUMERIC_KEYS) {
    const num = Number(merged[key]);
    merged[key] = Number.isFinite(num) ? num : base[key];
  }
  return merged as unknown as Config;
}

/** Lê a configuração de uma carteira (FOREX = chave legada "settings", compatível com produção). */
export async function getConfig(portfolio: PortfolioId | string = "FOREX"): Promise<Config> {
  const p = normalizePortfolio(portfolio);
  const key = configKeyFor(p);
  const base = defaultConfigFor(p);
  const rows = await getDb().select().from(config).where(eq(config.key, key)).limit(1);
  if (rows.length === 0) {
    return base;
  }
  try {
    const parsed = JSON.parse(rows[0].value);
    return normalizeConfig(parsed, base);
  } catch {
    return base;
  }
}

export async function saveConfig(newConfig: Partial<Config>, portfolio: PortfolioId | string = "FOREX"): Promise<Config> {
  const p = normalizePortfolio(portfolio);
  const key = configKeyFor(p);
  const current = await getConfig(p);
  const merged = normalizeConfig({ ...current, ...newConfig }, defaultConfigFor(p));
  const rows = await getDb().select().from(config).where(eq(config.key, key)).limit(1);
  if (rows.length === 0) {
    await getDb().insert(config).values({ key, value: JSON.stringify(merged) });
  } else {
    await getDb().update(config).set({ value: JSON.stringify(merged), updatedAt: new Date() }).where(eq(config.key, key));
  }
  return merged;
}

/** Resumo das três carteiras de uma vez (usado pelo seletor do dashboard). */
export async function getAllConfigs(): Promise<Record<PortfolioId, Config>> {
  const [FOREX, B3, CRYPTO] = await Promise.all([getConfig("FOREX"), getConfig("B3"), getConfig("CRYPTO")]);
  return { FOREX, B3, CRYPTO };
}
