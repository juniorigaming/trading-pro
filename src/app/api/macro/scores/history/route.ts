import { errorResponse, json } from "@/lib/api-utils";
import { getScoreHistory } from "@/lib/macro/pipeline";
import type { Currency } from "@/lib/ai/types";
export const dynamic = "force-dynamic";
/** GET ?days=7|30|90[&currency=USD] */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const d = Number(url.searchParams.get("days") ?? 30);
    const days = d === 7 ? 7 : d === 90 ? 90 : 30;
    const currency = url.searchParams.get("currency") as Currency | null;
    return json(await getScoreHistory(days, currency ?? undefined));
  } catch (e) { return errorResponse(e, "Falha ao carregar histórico"); }
}
