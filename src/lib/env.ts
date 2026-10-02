/**
 * Acesso unificado a variáveis de ambiente (Node local e Cloudflare Workers via OpenNext).
 * Chaves de IA ficam apenas aqui — nunca em NEXT_PUBLIC_*.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppEnv {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  APP_API_TOKEN?: string;
  DATABASE_URL?: string;
}

const KEYS: (keyof AppEnv)[] = ["AI_PROVIDER", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "APP_API_TOKEN", "DATABASE_URL"];

let overrides: Partial<AppEnv> | null = null;
/** Para testes: sobrescreve o ambiente sem tocar em process.env. */
export function setEnvOverrides(o: Partial<AppEnv> | null) { overrides = o; }

export function getEnv(): AppEnv {
  const out: AppEnv = {};
  let cfEnv: Record<string, string | undefined> | null = null;
  try {
    // Só funciona dentro do Worker (OpenNext); em Node/testes lança e cai no process.env.
    cfEnv = (getCloudflareContext().env as unknown as Record<string, string | undefined>) ?? null;
  } catch { cfEnv = null; }
  for (const k of KEYS) {
    const v = overrides?.[k] ?? cfEnv?.[k] ?? process.env[k];
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}
