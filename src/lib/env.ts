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
  GEMINI_FALLBACK_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  QWEN_API_KEY?: string;
  QWEN_MODEL?: string;
  QWEN_BASE_URL?: string;
  /** "0" desliga a 2ª chamada de verificação visual (não recomendado). */
  MACRO_VISUAL_VERIFY?: string;
  OPENAI_FALLBACK_MODEL?: string;
  APP_API_TOKEN?: string;
  DATABASE_URL?: string;
}

const KEYS: (keyof AppEnv)[] = ["AI_PROVIDER", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "QWEN_API_KEY", "QWEN_MODEL", "QWEN_BASE_URL", "MACRO_VISUAL_VERIFY", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODEL", "OPENAI_FALLBACK_MODEL", "APP_API_TOKEN", "DATABASE_URL"];

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
