/** RAW economic_events: GET (?status=pending|released&days=) · POST (manual) · PATCH (editar) · DELETE (?id=) */
import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { economicEvents, macroInterpretations } from "@/db/schema";
import { authorize, errorResponse, json } from "@/lib/api-utils";
import { saveRawEvents } from "@/lib/macro/pipeline";
import { G8 } from "@/lib/ai/types";
import { parseNumeric } from "@/lib/macro/scoring";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const days = Math.min(Number(url.searchParams.get("days") ?? 14), 120);
    const since = new Date(Date.now() - days * 86_400_000);
    const conds = [gte(economicEvents.scheduledAt, since)];
    if (status) conds.push(eq(economicEvents.status, status));
    const rows = await getDb().select({
      e: economicEvents, interp: { classification: macroInterpretations.classification, category: macroInterpretations.category, importance: macroInterpretations.importance, confidence: macroInterpretations.confidence, reasoning: macroInterpretations.reasoningSummary, contribution: macroInterpretations.scoreContribution, cbImplication: macroInterpretations.centralBankImplication },
    }).from(economicEvents).leftJoin(macroInterpretations, and(eq(macroInterpretations.eventId, economicEvents.id), eq(macroInterpretations.isCurrent, true)))
      .where(and(...conds)).orderBy(desc(economicEvents.scheduledAt)).limit(500);
    return json(rows.map((r) => ({ ...r.e, interpretation: r.interp?.classification ? r.interp : null })));
  } catch (e) { return errorResponse(e, "Falha ao listar eventos"); }
}

const ManualSchema = z.object({
  date: z.string(), time: z.string().nullable(), currency: z.enum(G8), event: z.string().min(1).max(200), impact: z.enum(["high", "medium", "low", "holiday", "unknown"]).default("unknown"),
  actual: z.string().nullable().optional(), forecast: z.string().nullable().optional(), previous: z.string().nullable().optional(), tzOffsetMinutes: z.number().int().optional(),
});
export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const b = ManualSchema.parse(await request.json());
    const ids = await saveRawEvents([{ ...b, actual: b.actual ?? null, forecast: b.forecast ?? null, previous: b.previous ?? null, source: "manual" }], { tzOffsetMinutes: b.tzOffsetMinutes });
    return json({ ids }, 201);
  } catch (e) { return errorResponse(e, "Falha ao criar evento"); }
}

const PatchSchema = z.object({ id: z.number().int(), actual: z.string().nullable().optional(), forecast: z.string().nullable().optional(), previous: z.string().nullable().optional(), impact: z.enum(["high", "medium", "low", "holiday", "unknown"]).optional(), status: z.enum(["pending", "released", "cancelled"]).optional() });
export async function PATCH(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const b = PatchSchema.parse(await request.json());
    const db = getDb();
    const [before] = await db.select().from(economicEvents).where(eq(economicEvents.id, b.id)).limit(1);
    if (!before) return json({ error: "Evento não encontrado" }, 404);
    const set: Record<string, unknown> = { updatedAt: new Date(), userEdited: true };
    const edits: Record<string, { from: unknown; to: unknown }> = { ...((before.userEdits as Record<string, { from: unknown; to: unknown }>) ?? {}) };
    for (const k of ["actual", "forecast", "previous", "impact", "status"] as const) {
      if (b[k] !== undefined && b[k] !== before[k]) { set[k] = b[k]; edits[k] = { from: before[k], to: b[k] }; }
    }
    if ("actual" in set) { set.actualNum = parseNumeric(set.actual as string | null); set.status = set.actual ? "released" : "pending"; }
    if ("forecast" in set) set.forecastNum = parseNumeric(set.forecast as string | null);
    if ("previous" in set) set.previousNum = parseNumeric(set.previous as string | null);
    set.userEdits = edits;
    await db.update(economicEvents).set(set).where(eq(economicEvents.id, b.id));
    if ("actual" in set) await db.update(macroInterpretations).set({ isCurrent: false }).where(eq(macroInterpretations.eventId, b.id));
    return json({ ok: true, edits });
  } catch (e) { return errorResponse(e, "Falha ao editar evento"); }
}

export async function DELETE(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!id) return json({ error: "id obrigatório" }, 400);
    await getDb().delete(economicEvents).where(eq(economicEvents.id, id));
    return json({ ok: true });
  } catch (e) { return errorResponse(e, "Falha ao excluir evento"); }
}
