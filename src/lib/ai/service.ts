/**
 * AIAnalysisService — serviço centralizado de IA (somente backend).
 * - Provedores: openai (padrão), gemini (free tier), mock (testes / sem chave)
 * - Structured Outputs (JSON Schema estrito) + validação Zod dupla
 * - Timeout, retry com backoff (429/5xx/rede), rate-limit handling, logging em ai_calls
 * - A chave NUNCA sai do servidor.
 */
import { z } from "zod";
import { SCHEMAS, toJsonSchema, type SchemaName } from "./schemas";
import type { PromptDef } from "./prompts";
import { getEnv } from "@/lib/env";
import { mockStructured } from "./mock";

export type AIProvider = "openai" | "gemini" | "mock";

export interface AIImage {
  base64: string; // sem prefixo data:
  mime: "image/png" | "image/jpeg" | "image/webp";
  label?: string;
}

export interface StructuredRequest {
  purpose: string; // macro_extract | macro_interpret | session_brief | technical_analysis | trade_review
  prompt: PromptDef;
  user: string;
  images?: AIImage[];
  schemaName: SchemaName;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface StructuredResponse<T> {
  data: T;
  provider: AIProvider;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  retries: number;
}

export class AIError extends Error {
  constructor(message: string, public status: number = 502, public code: string = "AI_ERROR") {
    super(message);
  }
}

type Logger = (entry: {
  purpose: string; provider: string; model: string; promptVersion: string; schemaName: string; inputType: string;
  imagesCount: number; inputTokens: number | null; outputTokens: number | null; latencyMs: number; ok: boolean; error: string | null; retries: number;
}) => Promise<void>;

let logger: Logger | null = null;
/** Injeta o logger de auditoria (ai_calls). Mantido fora deste módulo para testes sem banco. */
export function setAICallLogger(fn: Logger | null) { logger = fn; }

export function resolveProvider(): { provider: AIProvider; model: string; apiKey: string | null } {
  const env = getEnv();
  const requested = (env.AI_PROVIDER || "openai").toLowerCase() as AIProvider;
  if (requested === "mock") return { provider: "mock", model: "mock-1", apiKey: null };
  if (requested === "gemini") {
    if (!env.GEMINI_API_KEY) return { provider: "mock", model: "mock-1 (GEMINI_API_KEY ausente)", apiKey: null };
    return { provider: "gemini", model: env.GEMINI_MODEL || "gemini-3.8-flash", apiKey: env.GEMINI_API_KEY };
  }
  if (!env.OPENAI_API_KEY) return { provider: "mock", model: "mock-1 (OPENAI_API_KEY ausente)", apiKey: null };
  return { provider: "openai", model: env.OPENAI_MODEL || "gpt-4.1-mini", apiKey: env.OPENAI_API_KEY };
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** Chamada principal: retorna JSON validado pelo schema Zod. */
/** Modelo reserva usado automaticamente quando o principal responde 429/503 repetidamente (free tier do Gemini oscila). */
export function resolveFallbackModel(provider: AIProvider, primary: string): string | null {
  const env = getEnv();
  if (provider === "gemini") { const fb = env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite"; return fb !== primary ? fb : null; }
  if (provider === "openai") { const fb = env.OPENAI_FALLBACK_MODEL || "gpt-4.1-mini"; return fb !== primary ? fb : null; }
  return null;
}

export async function generateStructured<N extends SchemaName>(
  req: StructuredRequest & { schemaName: N },
  modelOverride?: string,
): Promise<StructuredResponse<z.infer<(typeof SCHEMAS)[N]>>> {
  const zodSchema = SCHEMAS[req.schemaName];
  const jsonSchema = toJsonSchema(zodSchema);
  const resolved = resolveProvider();
  const { provider, apiKey } = resolved;
  const model = modelOverride ?? resolved.model;
  const started = Date.now();
  const timeoutMs = req.timeoutMs ?? 90_000;
  const images = req.images ?? [];
  let retries = 0;
  let lastError: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const log = async (ok: boolean, err: string | null) => {
    if (!logger) return;
    try {
      await logger({
        purpose: req.purpose, provider, model, promptVersion: req.prompt.version, schemaName: req.schemaName,
        inputType: images.length ? "image" : "text", imagesCount: images.length, inputTokens, outputTokens,
        latencyMs: Date.now() - started, ok, error: err, retries,
      });
    } catch { /* logging nunca derruba a análise */ }
  };

  // Até 3 tentativas de rede/5xx + 1 tentativa extra de validação (reenvia com o erro do schema).
  let validationHint = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      let raw: string;
      if (provider === "mock") {
        raw = JSON.stringify(mockStructured(req.schemaName, req.user));
      } else if (provider === "openai") {
        const r = await callOpenAI({ apiKey: apiKey!, model, system: req.prompt.system, user: req.user + validationHint, images, jsonSchema, schemaName: req.schemaName, temperature: req.temperature ?? 0.2, maxOutputTokens: req.maxOutputTokens ?? 6000, timeoutMs });
        raw = r.text; inputTokens = r.inputTokens; outputTokens = r.outputTokens;
      } else {
        const r = await callGemini({ apiKey: apiKey!, model, system: req.prompt.system, user: req.user + validationHint, images, jsonSchema, temperature: req.temperature ?? 0.2, maxOutputTokens: req.maxOutputTokens ?? 6000, timeoutMs });
        raw = r.text; inputTokens = r.inputTokens; outputTokens = r.outputTokens;
      }

      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new AIError("Resposta da IA não é JSON válido", 502, "AI_INVALID_JSON"); }
      const result = zodSchema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        if (attempt < 3) {
          retries++;
          validationHint = `\n\n[CORREÇÃO] Sua resposta anterior falhou na validação do schema: ${issues}. Responda novamente respeitando o schema exatamente.`;
          continue;
        }
        throw new AIError(`Resposta da IA fora do schema: ${issues}`, 422, "AI_SCHEMA_INVALID");
      }
      await log(true, null);
      return { data: result.data as z.infer<(typeof SCHEMAS)[N]>, provider, model, promptVersion: req.prompt.version, inputTokens, outputTokens, latencyMs: Date.now() - started, retries };
    } catch (e: unknown) {
      const err = e as { message?: string; name?: string; status?: number };
      lastError = err?.message || String(e);
      const retryable = err.name === "AbortError" || (err instanceof AIError && RETRYABLE.has(err.status)) || /fetch failed|network|ECONNRESET/i.test(lastError);
      if (retryable && attempt < 3) {
        retries++;
        await sleep(1500 * Math.pow(2, attempt)); // 1.5s, 3s, 6s
        continue;
      }
      await log(false, lastError);
      // Esgotou as tentativas por sobrecarga/limite (429/503): tenta uma vez o modelo reserva.
      const fallback = retryable && !modelOverride ? resolveFallbackModel(provider, model) : null;
      if (fallback) {
        console.warn(`[ai] ${model} indisponível (${lastError.slice(0, 80)}); tentando modelo reserva ${fallback}`);
        return generateStructured(req, fallback);
      }
      if (err instanceof AIError) throw err;
      if (err.name === "AbortError") throw new AIError("Tempo limite excedido ao chamar a IA", 504, "AI_TIMEOUT");
      throw new AIError(lastError, 502, "AI_ERROR");
    }
  }
  await log(false, lastError);
  throw new AIError(lastError || "Falha desconhecida na IA", 502, "AI_ERROR");
}

// ---------------------------------------------------------------------------
// OpenAI — Responses API com text.format json_schema (strict)
// ---------------------------------------------------------------------------
async function callOpenAI(p: { apiKey: string; model: string; system: string; user: string; images: AIImage[]; jsonSchema: Record<string, unknown>; schemaName: string; temperature: number; maxOutputTokens: number; timeoutMs: number }) {
  const content: Record<string, unknown>[] = [{ type: "input_text", text: p.user }];
  for (const img of p.images) {
    if (img.label) content.push({ type: "input_text", text: `[Imagem: ${img.label}]` });
    content.push({ type: "input_image", image_url: `data:${img.mime};base64,${img.base64}`, detail: "high" });
  }
  const body = {
    model: p.model,
    instructions: p.system,
    input: [{ role: "user", content }],
    temperature: p.temperature,
    max_output_tokens: p.maxOutputTokens,
    text: { format: { type: "json_schema", name: p.schemaName, strict: true, schema: p.jsonSchema } },
  };
  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
    body: JSON.stringify(body),
  }, p.timeoutMs);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let msg = `OpenAI HTTP ${res.status}`;
    try { msg += `: ${JSON.parse(txt)?.error?.message ?? ""}`; } catch { msg += txt ? `: ${txt.slice(0, 200)}` : ""; }
    if (res.status === 429) msg += " (rate limit / sem crédito — aguarde ou verifique billing)";
    throw new AIError(msg, res.status);
  }
  const json = (await res.json()) as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[]; usage?: { input_tokens?: number; output_tokens?: number }; status?: string; incomplete_details?: { reason?: string } };
  let text = json.output_text ?? "";
  if (!text && Array.isArray(json.output)) {
    for (const item of json.output) {
      if (item.type === "message" && item.content) {
        for (const c of item.content) if (c.type === "output_text" && c.text) text += c.text;
      }
    }
  }
  if (!text) throw new AIError(`OpenAI retornou vazio (status=${json.status}, motivo=${json.incomplete_details?.reason ?? "?"})`, 502);
  return { text, inputTokens: json.usage?.input_tokens ?? null, outputTokens: json.usage?.output_tokens ?? null };
}

// ---------------------------------------------------------------------------
// Gemini — generateContent com responseSchema (alternativa gratuita)
// ---------------------------------------------------------------------------
async function callGemini(p: { apiKey: string; model: string; system: string; user: string; images: AIImage[]; jsonSchema: Record<string, unknown>; temperature: number; maxOutputTokens: number; timeoutMs: number }) {
  const parts: Record<string, unknown>[] = [{ text: p.user }];
  for (const img of p.images) {
    if (img.label) parts.push({ text: `[Imagem: ${img.label}]` });
    parts.push({ inline_data: { mime_type: img.mime, data: img.base64 } });
  }
  const body = {
    system_instruction: { parts: [{ text: p.system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: p.temperature, maxOutputTokens: p.maxOutputTokens, responseMimeType: "application/json", responseSchema: geminiSchema(p.jsonSchema) },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent?key=${encodeURIComponent(p.apiKey)}`;
  const res = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, p.timeoutMs);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new AIError(`Gemini HTTP ${res.status}: ${txt.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  const text = json.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  if (!text) throw new AIError("Gemini retornou vazio", 502);
  return { text, inputTokens: json.usageMetadata?.promptTokenCount ?? null, outputTokens: json.usageMetadata?.candidatesTokenCount ?? null };
}

/** Gemini não aceita additionalProperties/$schema e trata nullable via "nullable". */
function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const n = { ...(node as Record<string, unknown>) };
  delete n.additionalProperties; delete n.$schema; delete n.default;
  if (Array.isArray(n.anyOf)) {
    const nonNull = (n.anyOf as Record<string, unknown>[]).filter((x) => x.type !== "null");
    const hasNull = nonNull.length !== (n.anyOf as unknown[]).length;
    if (nonNull.length === 1) { const base = geminiSchema(nonNull[0]) as Record<string, unknown>; if (hasNull) base.nullable = true; delete n.anyOf; return { ...n, ...base }; }
  }
  if (Array.isArray(n.type)) { const types = (n.type as string[]).filter((t) => t !== "null"); n.type = types[0]; n.nullable = true; }
  if (n.properties) { const props: Record<string, unknown> = {}; for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) props[k] = geminiSchema(v); n.properties = props; }
  if (n.items) n.items = geminiSchema(n.items);
  return n;
}
