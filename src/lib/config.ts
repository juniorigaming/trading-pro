import { getDb } from "@/db";
import { config } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Config } from "./types";

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
export function normalizeConfig(raw: Partial<Config>): Config {
  const merged: Record<string, unknown> = { ...DEFAULT_CONFIG, ...raw };
  for (const key of NUMERIC_KEYS) {
    const num = Number(merged[key]);
    merged[key] = Number.isFinite(num) ? num : DEFAULT_CONFIG[key];
  }
  return merged as unknown as Config;
}

export async function getConfig(): Promise<Config> {
  const rows = await getDb().select().from(config).where(eq(config.key, CONFIG_KEY)).limit(1);
  if (rows.length === 0) {
    return DEFAULT_CONFIG;
  }
  try {
    const parsed = JSON.parse(rows[0].value);
    return normalizeConfig(parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(newConfig: Partial<Config>): Promise<Config> {
  const current = await getConfig();
  const merged = normalizeConfig({ ...current, ...newConfig });
  const rows = await getDb().select().from(config).where(eq(config.key, CONFIG_KEY)).limit(1);
  if (rows.length === 0) {
    await getDb().insert(config).values({ key: CONFIG_KEY, value: JSON.stringify(merged) });
  } else {
    await getDb().update(config).set({ value: JSON.stringify(merged), updatedAt: new Date() }).where(eq(config.key, CONFIG_KEY));
  }
  return merged;
}
