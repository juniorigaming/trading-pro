import { errorResponse, json } from "@/lib/api-utils";
import { SESSIONS, type Session } from "@/lib/ai/types";
import { getLatestAnalysis } from "@/lib/macro/pipeline";
import { filterEligibleTradeCandidates } from "@/lib/macro/pairs";
export const dynamic = "force-dynamic";

/**
 * GET[?session=] → only eligible candidates from the latest analysis.
 * Ineligible pairs remain in `pairs_to_avoid`; they must never be shown as trade candidates.
 */
export async function GET(request: Request) {
  try {
    const sessionParam = new URL(request.url).searchParams.get("session");
    if (sessionParam && sessionParam !== "ALL" && !(SESSIONS as readonly string[]).includes(sessionParam)) {
      return json({ error: "Sessão inválida" }, 400);
    }

    const session = sessionParam && sessionParam !== "ALL" ? sessionParam as Session : undefined;
    const latest = await getLatestAnalysis(session);
    if (!latest || latest.analysis_status !== "OK") return json([]);

    const candidates = filterEligibleTradeCandidates(
      latest.trade_candidates ?? [],
      true,
      (latest.pairs_to_avoid ?? []).map((pair) => pair.symbol),
    );
    const unique = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) if (!unique.has(candidate.symbol)) unique.set(candidate.symbol, candidate);

    return json([...unique.values()]
      .sort((a, b) => a.priority - b.priority)
      .map((candidate) => ({
        ...candidate,
        event_risk_assessed: candidate.event_risk_assessed ?? (latest.calendar_status === "PROVIDED"),
      })));
  } catch (e) {
    return errorResponse(e, "Falha ao carregar candidatos");
  }
}
