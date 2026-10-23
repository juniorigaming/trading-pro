import { errorResponse, json } from "@/lib/api-utils";
import { loadPendingEvents, latestScores, loadScoringConfig } from "@/lib/macro/pipeline";
import { eventRiskFor } from "@/lib/macro/event-risk";
import { splitSymbol } from "@/lib/macro/pairs";
import { G8, type Currency } from "@/lib/ai/types";
export const dynamic = "force-dynamic";
/** GET [?symbol=AUDJPY][&hours=N] → padrão intraday por moeda ou overnight quando há par; `hours` explícito sobrescreve. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbol");
    const cfg = await loadScoringConfig();
    const defaultHours = symbol ? cfg.event_risk_hours.overnight : cfg.event_risk_hours.intraday;
    const requestedHours = url.searchParams.get("hours");
    const parsedHours = requestedHours == null ? defaultHours : Number(requestedHours);
    const hours = Number.isFinite(parsedHours) ? Math.max(1, Math.min(parsedHours, 72)) : defaultHours;
    const [pending, scores] = await Promise.all([loadPendingEvents(new Date(), hours), latestScores()]);
    const currencies = G8.map((c) => ({ currency: c, current_bias: scores.find((s) => s.currency === c)?.bias ?? "NEUTRAL", ...eventRiskFor([c], pending, { horizonHours: hours }) }));
    let pair = null;
    if (symbol) {
      const p = splitSymbol(symbol);
      if (p) {
        const legs = [p.base, p.quote].filter((x): x is Currency => (G8 as readonly string[]).includes(x));
        pair = { symbol: symbol.toUpperCase(), ...eventRiskFor(legs, pending, { horizonHours: hours }) };
      }
    }
    return json({ horizon_hours: hours, currencies, pair, pending });
  } catch (e) { return errorResponse(e, "Falha ao calcular event risk"); }
}
