import { errorResponse, json } from "@/lib/api-utils";
import { listJournal, toStatsRows } from "@/lib/journal/service";
import { bucketStats, buildObservations, diAlignmentBucket, divergenceBucket, dxyAlignmentBucket, groupBy, macroScoreBucket, maeMfeStats, weekdayName } from "@/lib/journal/stats";
export const dynamic = "force-dynamic";
/** GET ?market=FOREX|B3&instrument=WIN|DOL|WDO → estatísticas por dimensão + MAE/MFE + observações (hipóteses) */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const market = url.searchParams.get("market"), instrument = url.searchParams.get("instrument");
    let rows = toStatsRows(await listJournal(1000));
    if (market === "B3") rows = rows.filter((r) => r.instrument !== null && r.instrument !== undefined);
    else if (market === "FOREX") rows = rows.filter((r) => !r.instrument);
    if (instrument && ["WIN", "DOL", "WDO"].includes(instrument)) rows = rows.filter((r) => r.instrument === instrument);
    return json({
      filters: { market: market ?? "ALL", instrument: instrument ?? null },
      by_regime: groupBy(rows, (r) => r.riskRegime ?? (r.instrument ? "sem regime" : "n/a")), by_macro_score: groupBy(rows, macroScoreBucket), by_di_alignment: groupBy(rows, diAlignmentBucket), by_dxy_alignment: groupBy(rows, dxyAlignmentBucket), by_instrument: groupBy(rows, (r) => r.instrument ?? (r.market ?? "FOREX")), by_event_risk: groupBy(rows, (r) => r.eventRiskAtEntry ?? "não registrado"),
      total: bucketStats("all", rows),
      by_session: groupBy(rows, (r) => r.session), by_symbol: groupBy(rows, (r) => r.symbol), by_direction: groupBy(rows, (r) => r.direction),
      by_setup_grade: groupBy(rows, (r) => r.setupGrade), by_entry_model: groupBy(rows, (r) => r.entryModel), by_mss_timeframe: groupBy(rows, (r) => r.mssTimeframe), by_mss_type: groupBy(rows, (r) => r.mssType),
      by_divergence: groupBy(rows, (r) => divergenceBucket(r.macroDivergence)), by_weekday: groupBy(rows, (r) => weekdayName(r.date)), by_error_tag: groupBy(rows, (r) => (r.errorTags.length ? r.errorTags : "sem tag")),
      mae_mfe: maeMfeStats(rows), observations: buildObservations(rows), min_sample: 20,
    });
  } catch (e) { return errorResponse(e, "Falha ao calcular estatísticas"); }
}
