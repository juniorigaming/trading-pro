/**
 * GET /api/export?format=json|csv&portfolio=ALL|FOREX|B3|CRYPTO
 *
 * Backup completo (sem limite de linhas): todas as operações + configurações das 3 carteiras.
 *  - json → arquivo para guardar/restaurar (reimportável via /api/broker/import format=generic)
 *  - csv  → planilha (Excel/Sheets)
 * Screenshots (base64 pesado) ficam de fora para o arquivo não explodir de tamanho.
 */
import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { serializeTrade } from "@/lib/trade-utils";
import { normalizePortfolio } from "@/lib/portfolio";
import { getAllConfigs } from "@/lib/config";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "id", "portfolio", "date", "time", "asset", "direction", "session", "setup", "status",
  "resultType", "resultAmount", "resultR", "entryPrice", "stopLoss", "takeProfit", "positionSize",
  "riskPercent", "executionScore", "followedPlan", "emotionalBefore", "emotionalAfter", "notes", "tags", "externalId",
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();
  const raw = (url.searchParams.get("portfolio") || "ALL").toUpperCase();
  const all = raw === "ALL";
  const portfolio = normalizePortfolio(raw);

  let db;
  try { db = getDb(); } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "DATABASE_URL não configurada" }, { status: 500 });
  }

  let rows: Record<string, unknown>[] = [];
  try {
    const where = all ? eq(trades.isDemo, false) : and(eq(trades.isDemo, false), eq(trades.portfolio, portfolio));
    const full = await db.select().from(trades).where(where).orderBy(desc(trades.date), desc(trades.id));
    // JSON guarda todos os campos (incluindo screenshots já comprimidos); CSV escolhe colunas compactas.
    rows = full.map((r) => serializeTrade(r as Record<string, unknown>));
  } catch (e) {
    return Response.json({ error: "Falha ao ler operações", detail: e instanceof Error ? e.message.slice(0, 200) : String(e) }, { status: 500 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `trading-pro-backup-${all ? "todas" : portfolio.toLowerCase()}-${stamp}`;

  if (format === "csv") {
    const lines = [CSV_COLUMNS.join(";")];
    for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(";"));
    // BOM para o Excel abrir acentos corretamente
    return new Response("\ufeff" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  let configs: unknown = null;
  try { configs = await getAllConfigs(); } catch { configs = null; }

  const payload = {
    app: "trading-pro",
    version: 1,
    exportedAt: new Date().toISOString(),
    portfolio: all ? "ALL" : portfolio,
    count: rows.length,
    configs,
    trades: rows,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
