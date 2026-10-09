import { GENERIC_TEMPLATE_CSV, IMPORT_FORMAT_LABEL, parseImport, detectFormat, type ImportFormatOrAuto } from "@/lib/import";
import { persistImport, readUploadText } from "@/lib/import/service";
import { normalizePortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * POST /api/broker/import  (multipart/form-data)
 *   file      → arquivo da corretora (HTML MT5, CSV Profit/Clear/Binance/Bybit ou CSV genérico)
 *   portfolio → FOREX | B3 | CRYPTO (default FOREX)
 *   format    → auto | mt5 | profit | clear | binance | bybit | generic (default auto)
 *   dryRun    → "1" apenas analisa e devolve pré-visualização (nada é gravado)
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    if (!form) return Response.json({ error: "Envie o arquivo em multipart/form-data (campo 'file')." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Arquivo ausente (campo 'file')." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Arquivo maior que 8 MB. Exporte um período menor." }, { status: 413 });

    const portfolio = normalizePortfolio(form.get("portfolio"));
    const formatRaw = String(form.get("format") || "auto").toLowerCase();
    const format = (["auto", "mt5", "profit", "clear", "binance", "bybit", "generic"].includes(formatRaw) ? formatRaw : "auto") as ImportFormatOrAuto;
    const dryRun = ["1", "true", "yes"].includes(String(form.get("dryRun") || "").toLowerCase());

    const text = await readUploadText(file);
    if (!text || text.trim().length < 10) return Response.json({ error: "Arquivo vazio." }, { status: 400 });

    const parsed = parseImport(text, { format, portfolio, fileName: file.name });
    if (parsed.trades.length === 0 && format === "auto" && !detectFormat(text, file.name)) {
      return Response.json({ error: parsed.warnings[0] || "Formato não reconhecido.", formats: IMPORT_FORMAT_LABEL, totalRows: 0 }, { status: 400 });
    }
    const summary = await persistImport(parsed, portfolio, file.name, dryRun);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[import] fatal:", message);
    return Response.json({ error: "Falha na importação", details: message }, { status: 500 });
  }
}

/** GET /api/broker/import?template=1 → baixa o CSV modelo. Sem parâmetro → lista de formatos. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("template")) {
    return new Response(GENERIC_TEMPLATE_CSV, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="modelo-importacao-trading-pro.csv"', "Cache-Control": "no-store" },
    });
  }
  return Response.json({ ok: true, version: "import-v1 multi-mercado", formats: IMPORT_FORMAT_LABEL });
}
