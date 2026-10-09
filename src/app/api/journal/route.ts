import { authorize, errorResponse, json } from "@/lib/api-utils";
import { createJournalEntry, listJournal } from "@/lib/journal/service";
import { JournalBody } from "@/lib/journal/schema";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
    return json(await listJournal(limit, url.searchParams.get("screenshots") === "1"));
  } catch (e) { return errorResponse(e, "Falha ao carregar journal"); }
}

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    const parsed = JournalBody.safeParse(await request.json());
    if (!parsed.success) return json({ error: "Payload inválido", issues: parsed.error.issues.slice(0, 5) }, 400);
    if (!parsed.data.symbol || !parsed.data.direction) return json({ error: "symbol e direction são obrigatórios" }, 400);
    const id = await createJournalEntry(parsed.data);
    return json({ id }, 201);
  } catch (e) { return errorResponse(e, "Falha ao criar entrada do journal"); }
}
