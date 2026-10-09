import { getDb } from "@/db";
import { trades } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { serializeTrade, TradeInput } from "@/lib/trade-utils";
import { mapTradeValues } from "@/lib/trade-mapper";
import { normalizePortfolio, type PortfolioId } from "@/lib/portfolio";
import { isMissingPortfolioColumn, resilientInsert } from "@/lib/trades-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_COLUMNS = {
  id: trades.id,
  date: trades.date,
  time: trades.time,
  asset: trades.asset,
  direction: trades.direction,
  session: trades.session,
  resultType: trades.resultType,
  resultAmount: trades.resultAmount,
  resultR: trades.resultR,
  isDemo: trades.isDemo,
};

/**
 * GET /api/trades?portfolio=FOREX|B3|CRYPTO|ALL&limit=&offset=
 * Sem `portfolio` → FOREX (comportamento idêntico ao anterior: os 14 trades do MT5 continuam aparecendo).
 * Se a coluna `portfolio` ainda não existir no banco (SQL 0003 não aplicado), cai no modo legado:
 * tudo é tratado como FOREX e as outras carteiras ficam vazias — header X-Portfolio-Column: missing.
 */
export async function GET(request: Request) {
  const start = Date.now();
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const rawPortfolio = (url.searchParams.get("portfolio") || "FOREX").toUpperCase();
    const all = rawPortfolio === "ALL";
    const portfolio: PortfolioId = normalizePortfolio(rawPortfolio);

    let db;
    try {
      db = getDb();
    } catch (dbError: unknown) {
      return Response.json([], {
        headers: { "Cache-Control": "no-store", "X-DB-Error": dbError instanceof Error ? dbError.message : "db" },
      });
    }

    let rows: Record<string, unknown>[] = [];
    let portfolioColumn: "ok" | "missing" = "ok";

    try {
      const where = all ? eq(trades.isDemo, false) : and(eq(trades.isDemo, false), eq(trades.portfolio, portfolio));
      rows = await db
        .select({ ...BASE_COLUMNS, portfolio: trades.portfolio, externalId: trades.externalId, notes: trades.notes })
        .from(trades)
        .where(where)
        .orderBy(desc(trades.date), desc(trades.id))
        .limit(limit)
        .offset(offset);
    } catch (e1: unknown) {
      if (isMissingPortfolioColumn(e1)) {
        portfolioColumn = "missing";
        if (!all && portfolio !== "FOREX") {
          rows = [];
        } else {
          try {
            rows = await db.select(BASE_COLUMNS).from(trades).where(eq(trades.isDemo, false)).orderBy(desc(trades.date)).limit(limit).offset(offset);
          } catch {
            rows = [];
          }
          rows = rows.map((r) => ({ ...r, portfolio: "FOREX" }));
        }
      } else {
        try {
          const allRows = await db.select().from(trades).where(eq(trades.isDemo, false)).orderBy(desc(trades.date)).limit(limit).offset(offset);
          rows = allRows
            .map((r) => {
              const { screenshotUrl, preTradeScreenshotUrl, postEntryScreenshotUrl, postExitScreenshotUrl, dxyScreenshotUrl, ...rest } = r as Record<string, unknown>;
              return rest;
            })
            .filter((r) => all || normalizePortfolio(r.portfolio) === portfolio);
        } catch {
          rows = [];
        }
      }
    }

    return Response.json(rows.map(serializeTrade), {
      headers: {
        "Cache-Control": "no-store",
        "X-Query-Time": `${Date.now() - start}ms`,
        "X-Portfolio": all ? "ALL" : portfolio,
        "X-Portfolio-Column": portfolioColumn,
      },
    });
  } catch (error: unknown) {
    return Response.json([], {
      headers: { "Cache-Control": "no-store", "X-Error": error instanceof Error ? error.message : "error" },
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TradeInput;

    if (!body.date || !body.asset || !body.direction) {
      return Response.json({ error: "Campos obrigatórios ausentes (data, ativo, direção)." }, { status: 400 });
    }

    if (body.screenshotUrl && body.screenshotUrl.length > 1_200_000) {
      return Response.json({ error: "Screenshot muito grande (max 900KB)" }, { status: 413 });
    }

    body.portfolio = normalizePortfolio(body.portfolio);
    const mapped = mapTradeValues(body);
    const values = mapped.db as Record<string, unknown>;

    let inserted: Record<string, unknown>;
    let dropped: string[] = [];
    try {
      const r = await resilientInsert(values);
      inserted = r.row;
      dropped = r.dropped;
    } catch (e: unknown) {
      console.error("[POST] resilientInsert falhou, tentando insert mínimo:", e instanceof Error ? e.message : e);
      const minimal = {
        date: values.date,
        time: values.time,
        asset: values.asset,
        direction: values.direction,
        session: values.session,
        resultAmount: values.resultAmount,
        resultType: values.resultType,
        portfolio: values.portfolio,
      };
      const r = await resilientInsert(minimal);
      inserted = r.row;
      dropped = r.dropped;
    }

    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (dropped.length) headers["X-Dropped-Columns"] = dropped.join(",");
    return Response.json(serializeTrade(inserted), { status: 201, headers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "erro";
    console.error("[POST] Error:", message);
    return Response.json({ error: "Failed to create trade", details: message }, { status: 500 });
  }
}
