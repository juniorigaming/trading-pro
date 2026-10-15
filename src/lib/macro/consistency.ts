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

  // 8. Ranking ordenado por FORÇA (score), nunca por confiança.
  const ranked = [...evaluated].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const misordered = ranked.some((c, k) => k > 0 && (c.score_raw ?? 0) > (ranked[k - 1].score_raw ?? 0) + 1e-9);
  add("ranking_by_strength", "Ranking ordenado por força macro (score), não por confiança", !misordered,
    misordered ? "Há moeda com score maior abaixo de outra com score menor." : `${ranked.length} moeda(s) em ordem decrescente de score.`);

  // 9. Confiança sempre 1–100 e limitada pelo teto por quantidade de evidências (1 ⇒ 70 · 2 ⇒ 80 · 3 ⇒ 90).
  const caps = [70, 80, 90, 100];
  const badConf = evaluated.filter((c) => c.confidence_pct === null || c.confidence_pct < 1 || c.confidence_pct > 100 || c.confidence_pct > caps[Math.min(3, Math.max(1, c.live_events) - 1)]);
  add("confidence_bounds", "Confiança entre 1% e 100% e dentro do teto por nº de evidências", badConf.length === 0,
    badConf.length === 0 ? "Nenhuma confiança fora da faixa; nenhum evento único com confiança artificialmente alta." : `Fora da faixa: ${badConf.map((c) => `${c.currency} ${c.confidence_pct}% (${c.live_events} ev.)`).join(", ")}`);

  // 10. Conflito entre indicadores reduz a confiança (penalidade registrada na decomposição).
  const conflicted = evaluated.filter((c) => c.conflict);
  const unpenalized = conflicted.filter((c) => c.confidence_breakdown && !c.confidence_breakdown.conflict_penalty);
  add("conflict_reduces_confidence", "Eventos conflitantes reduzem a confiança", unpenalized.length === 0,
    conflicted.length === 0 ? "Nenhuma moeda com indicadores conflitantes." : unpenalized.length === 0 ? `${conflicted.length} moeda(s) com conflito penalizadas.` : `Sem penalidade: ${unpenalized.map((c) => c.currency).join(", ")}`);

  const trusted = checks.every((c) => c.passed);
  return { trusted, checks };
}
