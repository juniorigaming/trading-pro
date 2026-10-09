import { parseImport } from "@/lib/import";
import { persistImport, readUploadText } from "@/lib/import/service";
import { normalizePortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * Rota legada (v32) mantida para compatibilidade: importa o HTML do MT5 na carteira FOREX
 * usando o mesmo motor de /api/broker/import (anti-duplicidade por ticket incluída).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    let fileText = "";
    let fileName = "historico";
    let portfolio = "FOREX";
    if (formData) {
      const file = formData.get("file");
      portfolio = String(formData.get("portfolio") || "FOREX");
      if (file instanceof File) { fileName = file.name; fileText = await readUploadText(file); }
      else fileText = String(formData.get("csv") || "");
    } else {
      const body = await request.json().catch(() => ({}));
      fileText = body.csv || body.text || body.html || "";
      portfolio = body.portfolio || "FOREX";
    }
    if (!fileText || fileText.trim().length < 10) return Response.json({ error: "Arquivo vazio" }, { status: 400 });
    const parsed = parseImport(fileText, { format: "auto", portfolio: normalizePortfolio(portfolio), fileName });
    if (parsed.trades.length === 0) {
      return Response.json({ error: parsed.warnings[0] || "Nenhuma operação encontrada - verifique se é HTML de histórico fechado", totalRows: 0 }, { status: 400 });
    }
    const summary = await persistImport(parsed, portfolio, fileName, false);
    return Response.json({ ...summary, success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[import-csv] Fatal:", message);
    return Response.json({ error: "Falha", details: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, version: "v33 multi-mercado (delegando para /api/broker/import)", message: "Importa MT5/Profit/Clear/Binance/Bybit/CSV sem duplicar" });
}
