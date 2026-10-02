import { errorResponse, json } from "@/lib/api-utils";
import { listJournal, toStatsRows } from "@/lib/journal/service";
import { bucketStats, buildObservations, divergenceBucket, groupBy, maeMfeStats, weekdayName } from "@/lib/journal/stats";
export const dynamic = "force-dynamic";
/** GET → estatísticas por dimensão + MAE/MFE + observações (hipóteses) */
export async function GET() {
  try {
    const rows = toStatsRows(await listJournal(1000));
    return json({
      total: bucketStats("all", rows),
      by_session: groupBy(rows, (r) => r.session), by_symbol: groupBy(rows, (r) => r.symbol), by_direction: groupBy(rows, (r) => r.direction),
      by_setup_grade: groupBy(rows, (r) => r.setupGrade), by_entry_model: groupBy(rows, (r) => r.entryModel), by_mss_timeframe: groupBy(rows, (r) => r.mssTimeframe), by_mss_type: groupBy(rows, (r) => r.mssType),
      by_divergence: groupBy(rows, (r) => divergenceBucket(r.macroDivergence)), by_weekday: groupBy(rows, (r) => weekdayName(r.date)), by_error_tag: groupBy(rows, (r) => (r.errorTags.length ? r.errorTags : "sem tag")),
      mae_mfe: maeMfeStats(rows), observations: buildObservations(rows), min_sample: 20,
    });
  } catch (e) { return errorResponse(e, "Falha ao calcular estatísticas"); }
}
