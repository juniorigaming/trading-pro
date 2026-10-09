/** Liga o logger de auditoria do serviço de IA à tabela ai_calls. Importar nas rotas de IA. */
import { getDb } from "@/db";
import { aiCalls } from "@/db/schema";
import { setAICallLogger } from "./service";

let wired = false;
export function ensureAIAudit() {
  if (wired) return;
  wired = true;
  setAICallLogger(async (e) => {
    await getDb().insert(aiCalls).values({
      purpose: e.purpose, provider: e.provider, model: e.model, promptVersion: e.promptVersion, schemaName: e.schemaName, inputType: e.inputType,
      imagesCount: e.imagesCount, inputTokens: e.inputTokens, outputTokens: e.outputTokens, latencyMs: e.latencyMs, ok: e.ok, error: e.error, retries: e.retries,
    });
  });
}
