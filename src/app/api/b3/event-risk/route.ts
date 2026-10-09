import { errorResponse, json } from "@/lib/api-utils";
import { loadPendingEvents } from "@/lib/macro/pipeline";
import { b3EventRisk } from "@/lib/b3/event-risk";
import { loadB3Config } from "@/lib/b3/pipeline";
export const dynamic = "force-dynamic";
/** GET ?hours=72 → event risk WIN/DOL + calendário BRL/USD/CNY pendente */
export async function GET(request: Request) {
  try {
    const hours = Math.min(Number(new URL(request.url).searchParams.get("hours") ?? 72), 240);
    const cfg = await loadB3Config();
    const pending = (await loadPendingEvents(new Date(), hours)).filter((p) => ["BRL", "USD", "CNY"].includes(p.currency));
    return json({ risk: b3EventRisk(pending, { cfg }), pending });
  } catch (e) { return errorResponse(e, "Falha ao calcular event risk B3"); }
}
