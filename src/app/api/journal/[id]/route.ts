import { authorize, errorResponse, json } from "@/lib/api-utils";
import { deleteScreenshot, getJournalEntry, updateJournalEntry } from "@/lib/journal/service";
import { JournalBody } from "@/lib/journal/schema";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, ctx: Ctx) {
  try { const { id } = await ctx.params; const e = await getJournalEntry(Number(id)); return e ? json(e) : json({ error: "não encontrado" }, 404); } catch (e) { return errorResponse(e); }
}
export async function PUT(request: Request, ctx: Ctx) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const parsed = JournalBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
    await updateJournalEntry(Number(id), parsed.data);
    return json(await getJournalEntry(Number(id)));
  } catch (e) { return errorResponse(e, "Falha ao atualizar journal"); }
}
export async function DELETE(request: Request, ctx: Ctx) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const { id } = await ctx.params;
    const shot = new URL(request.url).searchParams.get("screenshot");
    if (shot) { await deleteScreenshot(Number(id), Number(shot)); return json({ ok: true }); }
    return json({ error: "Use /api/trades/[id] para excluir a operação" }, 400);
  } catch (e) { return errorResponse(e); }
}
