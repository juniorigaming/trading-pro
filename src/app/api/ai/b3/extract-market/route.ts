/** POST multipart images[] → OCR de painéis (DI, DXY, US10Y, S&P, minério, fluxo...). NÃO salva: vai para validação humana. */
import { authorize, errorResponse, json, readImages } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { getMarketDataProvider, splitDiRows } from "@/lib/b3/providers";
import { loadDiContracts } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const form = await request.formData();
    const images = await readImages(form, "images");
    const contracts = await loadDiContracts();
    const r = await getMarketDataProvider("screenshot_ai").extract({ images: images.map((i) => ({ base64: i.base64, mime: i.mime, label: i.name })), diContracts: contracts });
    const { di, others } = splitDiRows(r.rows, contracts);
    return json({ rows: others, di_contracts: di, all_rows: r.rows, meta: { ...r.meta, imagesCount: images.length, sourceType: r.raw.source_type, notes: r.raw.notes } });
  } catch (e) { return errorResponse(e, "Falha ao ler painéis de mercado"); }
}
export async function GET() { return json({ ok: true, route: "ai/b3/extract-market", method: "POST multipart images[]" }); }
