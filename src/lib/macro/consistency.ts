/**
 * Validação de CONSISTÊNCIA executada antes de mostrar o resultado.
 * Qualquer NÃO ⇒ trusted = false ⇒ a UI mostra "ANÁLISE INSUFICIENTE" com o motivo, sem ranking.
 */
import type { AnalysisAudit, AuditCheck, CurrencyScoreView } from "@/lib/ai/types";
import { valueAppearsInRow } from "./extraction-validation";

export interface ConsistencyInput {
  ranked: CurrencyScoreView[];
  /** IDs dos eventos RAW gravados NESTA análise. Qualquer evidência fora deste conjunto é reutilização indevida. */
  analysisEventIds: Set<number>;
  /** Eventos liberados (com ATUAL) nesta análise. */
  releasedCount: number;
  /** Eventos liberados que receberam classificação nesta análise. Deve ser igual a releasedCount. */
  classifiedCount: number;
  inputType: "screenshot" | "structured" | "manual";
  extraction: AnalysisAudit["extraction"];
}

export function runConsistencyChecks(i: ConsistencyInput): { trusted: boolean; checks: AuditCheck[] } {
  const checks: AuditCheck[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string) => checks.push({ id, label, passed, detail });
  const evaluated = i.ranked.filter((c) => c.status === "EVALUATED");
  const insufficient = i.ranked.filter((c) => c.status !== "EVALUATED");

  // 1. Só moedas com evidência recebem posição no ranking.
  const badRank = i.ranked.filter((c) => (c.rank !== null) !== (c.status === "EVALUATED"));
  add("ranking_only_evaluated", "Ranking contém apenas moedas com evidência", badRank.length === 0,
    badRank.length === 0 ? `${evaluated.length} moeda(s) no ranking; ${insufficient.length} sem evidência fora dele.` : `Inconsistente em: ${badRank.map((c) => c.currency).join(", ")}`);

  // 2. Toda moeda do ranking tem evidência e justificativa.
  const unjustified = evaluated.filter((c) => c.score === null || c.live_events === 0 || c.drivers.length === 0);
  add("every_score_justified", "Todo score possui evidência e justificativa", unjustified.length === 0,
    unjustified.length === 0 ? "Todos os scores têm ao menos um evento mensurado." : `Sem justificativa: ${unjustified.map((c) => c.currency).join(", ")}`);

  // 3. Moeda sem evidência não recebe 0 nem confiança.
  const masked = insufficient.filter((c) => c.score !== null || c.confidence_pct !== null);
  add("no_zero_substitution", "Moeda sem evidência não recebe 0 nem confiança", masked.length === 0,
    masked.length === 0 ? `${insufficient.length} moeda(s) com score = null.` : `Mascaradas: ${masked.map((c) => c.currency).join(", ")}`);

  // 4. Nenhum evento antigo reutilizado.
  const foreign = i.ranked.flatMap((c) => c.drivers.filter((d) => !i.analysisEventIds.has(d.event_id)).map((d) => `${c.currency}:${d.event}`));
  add("no_reused_events", "Nenhum evento de análise anterior foi reutilizado", foreign.length === 0,
    foreign.length === 0 ? "Todas as evidências pertencem a esta análise." : `Eventos fora desta análise: ${foreign.slice(0, 5).join(", ")}`);

  // 5. Eventos interpretados == eventos liberados aceitos.
  add("interpreted_equals_extracted", "Eventos classificados = eventos liberados aceitos", i.classifiedCount === i.releasedCount,
    `${i.classifiedCount} classificado(s) de ${i.releasedCount} liberado(s).`);

  // 6. Valores usados existem no texto transcrito da própria linha.
  if (i.extraction) {
    const bad = i.extraction.accepted.filter((r) => r.raw_row_text && [r.actual, r.forecast, r.previous].some((v) => v && !valueAppearsInRow(v, r.raw_row_text!)));
    add("values_traceable", "Todo valor usado aparece na linha transcrita", bad.length === 0,
      bad.length === 0 ? `${i.extraction.accepted.length} linha(s) verificadas.` : `${bad.length} linha(s) com valor não rastreável.`);
  } else {
    add("values_traceable", "Todo valor usado aparece na linha transcrita", true, "Não se aplica (entrada manual/estruturada).");
  }

  // 7. Verificação visual (o evento está de fato no screenshot).
  if (i.inputType === "screenshot") {
    const v = i.extraction?.visual_verification ?? "UNAVAILABLE";
    const ok = v === "OK" || v === "REJECTED_SOME";
    add("visual_verification", "Eventos conferidos visualmente no screenshot", ok,
      v === "OK" ? "Todos os eventos aceitos foram confirmados na imagem." : v === "REJECTED_SOME" ? "Alguns eventos foram removidos pela checagem visual." : "Checagem visual não concluída — eventos não confirmados na imagem.");
  } else {
    add("visual_verification", "Eventos conferidos visualmente no screenshot", true, "Não se aplica (entrada manual/estruturada).");
  }

  const trusted = checks.every((c) => c.passed);
  return { trusted, checks };
}
