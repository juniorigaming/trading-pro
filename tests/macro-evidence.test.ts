/**
 * Invariantes da análise macro (sem banco, sem IA):
 *  - sem evidência ⇒ score null, sem rank, nunca 0
 *  - direção de número vem da tabela semântica (código); fala sem texto ⇒ UNKNOWN (não pontua)
 *  - extração: moeda/evento/valores precisam existir no texto transcrito da própria linha
 *  - consistência: qualquer falha ⇒ análise não confiável
 */
import { describe, it, expect } from "vitest";
import { computeCurrencyScores, type ScoredEvent } from "@/lib/macro/scoring";
import { classifyRelease, matchRule } from "@/lib/macro/indicators";
import { validateExtractedRows, type RawExtractedRow } from "@/lib/macro/extraction-validation";
import { runConsistencyChecks } from "@/lib/macro/consistency";
import { G8 } from "@/lib/ai/types";

const now = new Date("2026-10-08T23:40:00Z");
const ev = (p: Partial<ScoredEvent> & { currency: ScoredEvent["currency"] }): ScoredEvent => ({
  event_id: Math.floor(Math.random() * 1e9), event: "Core CPI m/m", impact: "high", released_at: new Date(now.getTime() - 86_400_000), superseded: false,
  category: "INFLATION", importance: "HIGH", classification: "BULLISH", confidence: "HIGH", ...p,
});

describe("sem evidência ⇒ null (nunca 0)", () => {
  it("moeda sem evento não recebe score, posição nem confiança", () => {
    const scores = computeCurrencyScores({ events: [ev({ currency: "GBP" })], now });
    const eur = scores.find((s) => s.currency === "EUR")!;
    expect(eur.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(eur.score).toBeNull(); expect(eur.rank).toBeNull(); expect(eur.confidence_pct).toBeNull(); expect(eur.score_display).toBeNull();
  });

  it("cenário sintético de screenshot só com GBP/USD/JPY/AUD: EUR/CAD/CHF/NZD NÃO aparecem no ranking", () => {
    const raw = [
      { currency: "USD" as const, event: "Core CPI m/m", actual: "0.4%", forecast: "0.3%", previous: "0.2%" },
      { currency: "GBP" as const, event: "Official Bank Rate", actual: "4.00%", forecast: "4.25%", previous: "4.25%" },
      { currency: "JPY" as const, event: "Trade Balance", actual: "-0.2T", forecast: "-0.5T", previous: "-0.6T" },
    ];
    const events: ScoredEvent[] = raw.map((r, i) => {
      const c = classifyRelease({ event: r.event, impact: "high", actual: r.actual, forecast: r.forecast, previous: r.previous });
      return ev({ event_id: i + 1, currency: r.currency, event: r.event, classification: c.classification, category: c.category, confidence: c.confidence === "LOW" ? "MEDIUM" : c.confidence, actual: r.actual, forecast: r.forecast, previous: r.previous, surprise: c.surprise, rule_id: c.rule_id, explanation: c.explanation });
    });
    const scores = computeCurrencyScores({ events, now });
    const ranked = scores.filter((s) => s.rank !== null).map((s) => s.currency);
    expect(ranked.sort()).toEqual(["GBP", "JPY", "USD"].sort());
    for (const c of ["EUR", "CAD", "CHF", "NZD", "AUD"] as const) {
      const s = scores.find((x) => x.currency === c)!;
      expect(s.score).toBeNull(); expect(s.rank).toBeNull();
    }
    expect(scores.filter((s) => s.rank !== null).every((s) => s.score !== null)).toBe(true);
  });

  it("evento medido neutro (dentro do limiar) é ZERO medido — status EVALUATED, não 'sem dado'", () => {
    const c = classifyRelease({ event: "Core CPI m/m", impact: "high", actual: "0.30%", forecast: "0.31%", previous: "0.2%" });
    expect(c.direction).toBe("NEUTRAL");
    const s = computeCurrencyScores({ events: [ev({ currency: "USD", classification: c.classification })], now }).find((x) => x.currency === "USD")!;
    expect(s.status).toBe("EVALUATED"); expect(s.score).toBe(0); expect(s.live_events).toBe(1);
  });
});

describe("direção por código (tabela semântica), não pela IA", () => {
  it("CPI acima do forecast = BULLISH da moeda; trabalho (desemprego) acima = BEARISH", () => {
    expect(classifyRelease({ event: "Core CPI m/m", impact: "high", actual: "0.5%", forecast: "0.3%", previous: null }).direction).toBe("BULLISH");
    expect(classifyRelease({ event: "Unemployment Rate", impact: "high", actual: "4.6%", forecast: "4.3%", previous: null }).direction).toBe("BEARISH");
  });
  it("fala de diretor sem texto ⇒ UNKNOWN, explicação explícita, não pontua", () => {
    const c = classifyRelease({ event: "MPC Member Breeden Speaks", impact: "medium", actual: null, forecast: null, previous: null });
    expect(c.direction).toBe("UNKNOWN"); expect(c.classification).toBe("UNKNOWN");
    expect(c.explanation).toContain("sem evidência textual suficiente");
    const s = computeCurrencyScores({ events: [ev({ currency: "GBP", classification: "UNKNOWN", explanation: c.explanation })], now }).find((x) => x.currency === "GBP")!;
    expect(s.score).toBeNull(); expect(s.excluded_events?.length).toBe(1);
  });
  it("indicador fora da tabela com ATUAL numérico ⇒ regra genérica explícita (confiança LOW, categoria OTHER), nunca conhecimento oculto da IA", () => {
    expect(matchRule("Some Obscure Index")).toBeNull();
    const c = classifyRelease({ event: "Some Obscure Index", impact: "high", actual: "5", forecast: "3", previous: "4" });
    expect(c.direction).toBe("BULLISH"); expect(c.rule_id).toBe("generic_higher_is_better"); expect(c.confidence).toBe("LOW"); expect(c.category).toBe("OTHER");
    // sem ATUAL continua UNKNOWN
    expect(classifyRelease({ event: "Some Obscure Index", impact: "high", actual: null, forecast: "3", previous: "4" }).direction).toBe("UNKNOWN");
  });
  it("sem FORECAST usa PREVIOUS com confiança LOW; sem ambos ⇒ UNKNOWN", () => {
    const withPrev = classifyRelease({ event: "Core CPI m/m", impact: "high", actual: "0.5%", forecast: null, previous: "0.2%" });
    expect(withPrev.reference_basis).toBe("PREVIOUS"); expect(withPrev.confidence).toBe("LOW");
    expect(classifyRelease({ event: "Core CPI m/m", impact: "high", actual: "0.5%", forecast: null, previous: null }).direction).toBe("UNKNOWN");
  });
  it("sem ATUAL ⇒ UNKNOWN (pendente nunca vira direção)", () => {
    expect(classifyRelease({ event: "Core CPI m/m", impact: "high", actual: null, forecast: "0.3%", previous: "0.2%" }).direction).toBe("UNKNOWN");
  });
  it("limiar relativo: claims 230K vs 215K (≈7%) é BEARISH; 216K vs 215K é ruído", () => {
    expect(classifyRelease({ event: "Unemployment Claims", impact: "high", actual: "230K", forecast: "215K", previous: null }).direction).toBe("BEARISH");
    expect(classifyRelease({ event: "Unemployment Claims", impact: "high", actual: "216K", forecast: "215K", previous: null }).direction).toBe("NEUTRAL");
  });
});

describe("validação da extração (código confere a IA)", () => {
  const allowed = G8 as readonly string[];
  const row = (p: Partial<RawExtractedRow>): RawExtractedRow => ({
    date: "2026-10-08", time: "09:30", currency: "USD", event: "Core CPI m/m", impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.2%",
    status: "released", ocr_confidence: 0.95, requires_manual_confirmation: false, ocr_issues: [], raw_row_text: "09:30 USD Core CPI m/m 0.4% 0.3% 0.2%", ...p,
  });

  it("linha legítima é aceita", () => {
    const r = validateExtractedRows([row({})], { allowed });
    expect(r.accepted).toHaveLength(1); expect(r.rejected).toHaveLength(0);
  });
  it("moeda que NÃO aparece na linha transcrita é rejeitada (ex.: EUR inventado)", () => {
    const r = validateExtractedRows([row({ currency: "EUR", raw_row_text: "09:30 USD Core CPI m/m 0.4%" })], { allowed });
    expect(r.accepted).toHaveLength(0); expect(r.rejected[0].reason).toContain("não aparece no texto transcrito");
  });
  it("evento que não consta na linha é rejeitado", () => {
    const r = validateExtractedRows([row({ event: "Non-Farm Payrolls", raw_row_text: "09:30 USD Core CPI m/m 0.4%" })], { allowed });
    expect(r.rejected[0].reason).toContain("não consta");
  });
  it("valor que não aparece na linha vira null (não inventado) e é registrado", () => {
    const r = validateExtractedRows([row({ forecast: "0.9%" })], { allowed });
    expect(r.accepted[0].forecast).toBeNull();
    expect(r.values_discarded[0].field).toBe("forecast");
  });
  it("released sem ATUAL validado vira pendente (forecast nunca vira resultado)", () => {
    const r = validateExtractedRows([row({ actual: "9.9%", raw_row_text: "09:30 USD Core CPI m/m forecast 0.3%" })], { allowed });
    expect(r.accepted[0].actual).toBeNull();
  });
  it("UNREADABLE, leitura incerta, fora do escopo e duplicata são rejeitados", () => {
    expect(validateExtractedRows([row({ raw_row_text: "UNREADABLE" })], { allowed }).rejected[0].reason).toContain("ilegível");
    expect(validateExtractedRows([row({ ocr_confidence: 0.3 })], { allowed }).rejected[0].reason).toContain("incerta");
    expect(validateExtractedRows([row({ currency: "CNY" as never, raw_row_text: "CNY Core CPI m/m" })], { allowed }).rejected[0].reason).toContain("fora do escopo");
    const dup = validateExtractedRows([row({}), row({})], { allowed });
    expect(dup.accepted).toHaveLength(1); expect(dup.rejected[0].reason).toContain("duplicada");
  });
});

describe("checagem de consistência", () => {
  const scoreFor = (events: ScoredEvent[]) => computeCurrencyScores({ events, now });
  const base = (over: Partial<Parameters<typeof runConsistencyChecks>[0]> = {}) => {
    const events = [ev({ event_id: 1, currency: "USD" })];
    return { ranked: scoreFor(events), analysisEventIds: new Set([1]), releasedCount: 1, classifiedCount: 1, inputType: "manual" as const, extraction: null, ...over };
  };
  it("análise limpa é confiável", () => { expect(runConsistencyChecks(base()).trusted).toBe(true); });
  it("evento de OUTRA análise reutilizado ⇒ não confiável", () => {
    expect(runConsistencyChecks(base({ analysisEventIds: new Set([999]) })).trusted).toBe(false);
  });
  it("interpretados ≠ extraídos ⇒ não confiável", () => { expect(runConsistencyChecks(base({ classifiedCount: 0 })).trusted).toBe(false); });
  it("screenshot sem verificação visual concluída ⇒ não confiável", () => {
    const extraction = { provider: "x", model: "y", raw_json: {}, rows_received: 1, accepted: [], rejected: [], values_discarded: [], visual_verification: "UNAVAILABLE" as const };
    expect(runConsistencyChecks(base({ inputType: "screenshot", extraction })).trusted).toBe(false);
  });
  it("score sem evidência (0 mascarando) ⇒ não confiável", () => {
    const ranked = scoreFor([ev({ event_id: 1, currency: "USD" })]).map((s) => (s.currency === "EUR" ? { ...s, score: 0 } : s));
    expect(runConsistencyChecks(base({ ranked })).trusted).toBe(false);
  });
});
