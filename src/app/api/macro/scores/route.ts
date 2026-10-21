import { errorResponse, json } from "@/lib/api-utils";
import { SESSIONS, type Session } from "@/lib/ai/types";
import { latestScores } from "@/lib/macro/pipeline";
export const dynamic = "force-dynamic";
/** GET[?session=] → último score da análise mais recente (ou da sessão selecionada). */
export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("session");
    if (value && !(SESSIONS as readonly string[]).includes(value)) return json({ error: "Sessão inválida" }, 400);
    return json(await latestScores(value ? value as Session : undefined));
  } catch (e) { return errorResponse(e, "Falha ao carregar scores"); }
}
