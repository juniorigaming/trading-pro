import { errorResponse, json } from "@/lib/api-utils";
import { getB3ScoreHistory } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET ?days=7|30|90&instrument=WIN|DOL|BRL|USD */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const d = Number(url.searchParams.get("days") ?? 30);
    const days = d === 7 ? 7 : d === 90 ? 90 : 30;
    const inst = url.searchParams.get("instrument") ?? undefined;
    return json(await getB3ScoreHistory(days, inst && ["USD", "BRL", "WIN", "DOL"].includes(inst) ? inst : undefined));
  } catch (e) { return errorResponse(e, "Falha ao carregar histórico B3"); }
}
