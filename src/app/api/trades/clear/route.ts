import { and, eq, isNotNull, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { normalizePortfolio } from "@/lib/portfolio";
import { isMissingPortfolioColumn } from "@/lib/trades-db";

export const dynamic = "force-dynamic";

/**
 * Exclusão em massa por carteira.
 *   DELETE|POST /api/trades/clear?portfolio=FOREX&scope=imported   → só operações importadas (default)
 *   DELETE|POST /api/trades/clear?portfolio=B3&scope=all           → todas as operações da carteira
 */
async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    let body: Record<string, unknown> = {};
    if (request.method === "POST") body = await request.json().catch(() => ({}));
    const portfolio = normalizePortfolio(url.searchParams.get("portfolio") ?? body.portfolio);
    const scope = String(url.searchParams.get("scope") ?? body.scope ?? "imported") === "all" ? "all" : "imported";
    const db = getDb();
    const importedCond = or(isNotNull(trades.externalId), like(trades.notes, "%Ticket %"));
    let deleted: { id: number }[] = [];
    try {
      const where = scope === "all" ? eq(trades.portfolio, portfolio) : and(eq(trades.portfolio, portfolio), importedCond);
      deleted = await db.delete(trades).where(where).returning({ id: trades.id });
    } catch (e) {
      if (!isMissingPortfolioColumn(e)) throw e;
      if (portfolio !== "FOREX") return Response.json({ ok: true, deleted: 0, note: "coluna portfolio ausente; nada a excluir fora de FOREX" });
      const where = scope === "all" ? undefined : like(trades.notes, "%Ticket %");
      deleted = where ? await db.delete(trades).where(where).returning({ id: trades.id }) : await db.delete(trades).returning({ id: trades.id });
    }
    return Response.json({ ok: true, portfolio, scope, deleted: deleted.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "Falha ao excluir", details: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
