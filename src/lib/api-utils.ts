/** Helpers de rota: autorização opcional, respostas de erro sem stack trace, validação de upload. */
import { getEnv } from "./env";
import { AIError } from "./ai/service";
import { ZodError } from "zod";

export const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB por imagem (comprimida no cliente ~300KB)
export const MAX_IMAGES = 10;

/**
 * O projeto atual não possui sistema de autenticação (single-user).
 * Se APP_API_TOKEN estiver definido, exige header `x-app-token` nas rotas de IA.
 */
export function authorize(request: Request): Response | null {
  const token = getEnv().APP_API_TOKEN;
  if (!token) return null;
  const given = request.headers.get("x-app-token") || new URL(request.url).searchParams.get("token");
  if (given !== token) return json({ error: "Não autorizado" }, 401);
  return null;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Nunca vaza stack trace; mapeia AIError para status apropriado. */
export function errorResponse(e: unknown, fallback = "Erro interno") {
  if (e instanceof AIError) return json({ error: e.message, code: e.code }, e.status >= 400 && e.status < 600 ? e.status : 502);
  if (e instanceof ZodError) return json({ error: "Payload inválido", issues: e.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  const msg = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : null;
  console.error("[api]", msg, cause ? `| causa: ${cause}` : "");
  const full = `${msg} ${cause ?? ""}`;
  const safe = /relation .* does not exist/i.test(full) ? "Tabelas do módulo de IA ausentes — rode a migration drizzle/0001_ai_module.sql (veja INSTRUCOES.txt)"
    : /column .* does not exist/i.test(full) ? "Coluna ausente no banco — a migration do módulo de IA está incompleta/desatualizada"
    : /DATABASE_URL/i.test(full) ? "DATABASE_URL não configurada" : fallback;
  // Detalhe curto e sem stack para depuração (mensagem do driver, não o trace)
  return json({ error: safe, detail: cause ? cause.slice(0, 200) : undefined }, 500);
}

export interface ValidatedImage { base64: string; mime: "image/png" | "image/jpeg" | "image/webp"; name: string; size: number; label?: string }

/** Valida arquivos de imagem do FormData (tipo, tamanho, quantidade) e converte para base64. */
export async function readImages(form: FormData, field = "images", labelsField = "labels"): Promise<ValidatedImage[]> {
  const files = form.getAll(field).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (files.length === 0) throw new AIError("Nenhuma imagem enviada", 400, "NO_IMAGES");
  if (files.length > MAX_IMAGES) throw new AIError(`Máximo de ${MAX_IMAGES} imagens por envio`, 400, "TOO_MANY_IMAGES");
  let labels: string[] = [];
  const rawLabels = form.get(labelsField);
  if (typeof rawLabels === "string") { try { labels = JSON.parse(rawLabels); } catch { labels = []; } }
  const out: ValidatedImage[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const mime = (f.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(mime)) throw new AIError(`Tipo de arquivo não permitido: ${mime || "desconhecido"} (use PNG, JPEG ou WebP)`, 415, "BAD_IMAGE_TYPE");
    if (f.size > MAX_IMAGE_BYTES) throw new AIError(`Imagem ${f.name} excede ${MAX_IMAGE_BYTES / 1024 / 1024} MB`, 413, "IMAGE_TOO_LARGE");
    const buf = new Uint8Array(await f.arrayBuffer());
    if (!looksLikeImage(buf, mime)) throw new AIError(`Arquivo ${f.name} não parece uma imagem válida`, 415, "BAD_IMAGE_SIGNATURE");
    out.push({ base64: toBase64(buf), mime: mime as ValidatedImage["mime"], name: f.name, size: f.size, label: labels[i] });
  }
  return out;
}

function looksLikeImage(b: Uint8Array, mime: string): boolean {
  if (mime === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8;
  if (mime === "image/webp") return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

function toBase64(bytes: Uint8Array): string {
  // Node/Workers (nodejs_compat): Buffer nativo é muito mais rápido que o loop em JS (economiza CPU no Worker)
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
