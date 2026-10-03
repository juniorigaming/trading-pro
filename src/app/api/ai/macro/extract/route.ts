/** POST multipart: images[] (+ timezone, referenceDate) → OCR estruturado. NÃO salva nada (vai para validação humana). */
import { authorize, errorResponse, json, readImages } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { getEconomicDataProvider } from "@/lib/macro/economic-data-provider";
import { ALL_CURRENCIES, G8, type AnyCurrency } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const form = await request.formData();
    const images = await readImages(form, "images");
    const timezone = (form.get("timezone") as string) || "America/Sao_Paulo (GMT-3)";
    const referenceDate = (form.get("referenceDate") as string) || new Date().toISOString().slice(0, 10);
    // currencies=BRL,USD,CNY (módulo B3) — padrão G8
    const ccyParam = String(form.get("currencies") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => (ALL_CURRENCIES as readonly string[]).includes(c)) as AnyCurrency[];
    const provider = getEconomicDataProvider("screenshot_ai");
    const result = await provider.extract({ images: images.map((i) => ({ base64: i.base64, mime: i.mime, label: i.name })), timezone, referenceDate, allowedCurrencies: ccyParam.length ? ccyParam : G8 });
    return json({ events: result.events, meta: { ...result.meta, imagesCount: images.length, sourceType: result.raw.source_type, detectedTimezone: result.raw.detected_timezone, notes: result.raw.notes } });
  } catch (e) { return errorResponse(e, "Falha ao extrair calendário"); }
}

export async function GET() { return json({ ok: true, route: "ai/macro/extract", method: "POST multipart images[]" }); }
