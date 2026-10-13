/** Cenário real (Forex Factory 12/10/2026, feriado US/CA): só dados de impacto baixo.
 *  Esperado: toda moeda com Actual numérico entra no ranking (GBP, JPY, AUD); sem dado fica fora. */
import { describe, it, expect } from "vitest";
import { classifyRelease } from "@/lib/macro/indicators";
import { computeCurrencyScores, evidenceLevel, type ScoredEvent } from "@/lib/macro/scoring";
import { IMPACT_TO_IMPORTANCE } from "@/lib/macro/indicators";
import type { AnyCurrency } from "@/lib/ai/types";

const now = new Date("2026-10-12T23:30:00Z");
const raw = [
  { id: 1, currency: "GBP", event: "MPC Member Breeden Speaks", impact: "low", actual: null, forecast: null, previous: null, t: "09:30" },
  { id: 2, currency: "USD", event: "Bank Holiday", impact: "holiday", actual: null, forecast: null, previous: null, t: "00:00" },
  { id: 3, currency: "CAD", event: "Bank Holiday", impact: "holiday", actual: null, forecast: null, previous: null, t: "00:00" },
  { id: 4, currency: "GBP", event: "MPC Member Mann Speaks", impact: "low", actual: null, forecast: null, previous: null, t: "12:50" },
  { id: 5, currency: "USD", event: "FOMC Member Hammack Speaks", impact: "low", actual: null, forecast: null, previous: null, t: "16:10" },
  { id: 6, currency: "GBP", event: "BRC Retail Sales Monitor y/y", impact: "low", actual: "1.0%", forecast: "0.8%", previous: "0.5%", t: "23:01" },
  { id: 7, currency: "JPY", event: "Bank Lending y/y", impact: "low", actual: "5.3%", forecast: "5.5%", previous: "5.3%", t: "23:50" },
  { id: 8, currency: "JPY", event: "PPI y/y", impact: "low", actual: "6.8%", forecast: "7.6%", previous: "7.6%", t: "23:50" },
  { id: 9, currency: "AUD", event: "Monetary Policy Meeting Minutes", impact: "low", actual: null, forecast: null, previous: null, t: "00:30" },
  { id: 10, currency: "AUD", event: "NAB Business Confidence", impact: "low", actual: "-13", forecast: null, previous: "-9", t: "00:30" },
];

function toScored(): ScoredEvent[] {
  return raw.filter((r) => r.actual !== null).map((r) => {
    const c = classifyRelease({ event: r.event, impact: r.impact, actual: r.actual, forecast: r.forecast, previous: r.previous });
    return {
      event_id: r.id, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact as ScoredEvent["impact"], released_at: new Date("2026-10-12T22:00:00Z"), superseded: false,
      category: c.category, importance: IMPACT_TO_IMPORTANCE[r.impact], classification: c.classification, confidence: c.confidence,
      actual: r.actual, forecast: r.forecast, previous: r.previous, surprise: c.surprise, reference_basis: c.reference_basis, rule_id: c.rule_id, explanation: c.explanation,
    };
  });
}

describe("evidência fraca entra no ranking (print FF 12/10)", () => {
  it("classificação determinística: BRC +0.2 no limiar = BULLISH (sem erro de ponto flutuante); NAB vs previous = BEARISH; Bank Lending agora tem regra", () => {
    const brc = classifyRelease({ event: "BRC Retail Sales Monitor y/y", impact: "low", actual: "1.0%", forecast: "0.8%", previous: "0.5%" });
    expect(brc.rule_id).toBe("retail_sales"); expect(brc.direction).toBe("BULLISH"); expect(brc.classification).toBe("BULLISH");
    const nab = classifyRelease({ event: "NAB Business Confidence", impact: "low", actual: "-13", forecast: null, previous: "-9" });
    expect(nab.direction).toBe("BEARISH"); expect(nab.reference_basis).toBe("PREVIOUS"); expect(nab.confidence).toBe("LOW");
    const bl = classifyRelease({ event: "Bank Lending y/y", impact: "low", actual: "5.3%", forecast: "5.5%", previous: "5.3%" });
    expect(bl.rule_id).toBe("credit"); expect(bl.direction).toBe("BEARISH");
    const ppi = classifyRelease({ event: "PPI y/y", impact: "low", actual: "6.8%", forecast: "7.6%", previous: "7.6%" });
    expect(ppi.classification).toBe("VERY_BEARISH");
  });
  it("GBP, JPY e AUD recebem score e posição; USD/CAD/EUR/CHF/NZD ficam sem dado", () => {
    const scores = computeCurrencyScores({ events: toScored(), now });
    const by = Object.fromEntries(scores.map((s) => [s.currency, s]));
    for (const c of ["GBP", "JPY", "AUD"]) { expect(by[c].status).toBe("EVALUATED"); expect(by[c].rank).toBeGreaterThan(0); expect(by[c].score_display).not.toBeNull(); }
    for (const c of ["USD", "CAD", "EUR", "CHF", "NZD"]) { expect(by[c].status).toBe("INSUFFICIENT_EVIDENCE"); expect(by[c].rank).toBeNull(); }
    // direções corretas e visíveis na escala −5..+5
    expect(by.GBP.score_display!).toBeGreaterThan(0);
    expect(by.JPY.score_display!).toBeLessThan(0);
    expect(by.AUD.score_display!).toBeLessThan(0);
    // ordem: GBP (único positivo) em 1º; JPY (2 misses, PPI forte) abaixo de AUD (1 dado sem forecast, peso mínimo)
    const ranked = scores.filter((s) => s.status === "EVALUATED").sort((a, b) => a.rank! - b.rank!).map((s) => s.currency);
    expect(ranked[0]).toBe("GBP"); expect(ranked).toEqual(["GBP", "AUD", "JPY"]);
    // etiquetas honestas: tudo evidência fraca, confiança baixa — nada vira candidato de par
    for (const c of ["GBP", "JPY", "AUD"]) { expect(by[c].evidence_level).toBe("WEAK"); expect(by[c].confidence_pct!).toBeLessThan(40); }
    console.log(scores.filter((s) => s.status === "EVALUATED").map((s) => `${s.rank} ${s.currency} ${s.score_display} (score ${s.score}, conf ${s.confidence_pct}%, massa ${s.evidence_mass}, ${s.evidence_level})`).join("\n"));
  });
  it("evento antigo com peso ínfimo continua sendo podado (min_weight_alive só para idade)", () => {
    const old = toScored().filter((e) => e.currency === "GBP").map((e) => ({ ...e, released_at: new Date("2026-09-20T00:00:00Z") })); // 22 dias (meia-vida 5d)
    const s = computeCurrencyScores({ events: old, now }).find((x) => x.currency === "GBP")!;
    expect(s.status).toBe("INSUFFICIENT_EVIDENCE"); expect(s.excluded_events?.[0].reason).toMatch(/antigo/);
  });
  it("evidenceLevel: massa alta = STRONG, primário = MODERATE, resto = WEAK", () => {
    expect(evidenceLevel(0.6, false)).toBe("STRONG"); expect(evidenceLevel(0.1, true)).toBe("MODERATE"); expect(evidenceLevel(0.25, false)).toBe("MODERATE"); expect(evidenceLevel(0.05, false)).toBe("WEAK");
  });
});
