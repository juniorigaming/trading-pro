/** Spec "MELHORIA CRÍTICA — motor macro e ranking": TODA moeda com ≥1 Actual visível é analisada.
 *  Cenário da spec: USD CPI/Core CPI, EUR German WPI, GBP CB Leading Index, CAD Building Permits, CNY M2/New Loans.
 *  Esperado: nenhuma dessas moedas é "sem dado"; CNY é avaliada à parte (fora do G8); confiança sempre 1..99%. */
import { describe, it, expect } from "vitest";
import { classifyRelease, IMPACT_TO_IMPORTANCE } from "@/lib/macro/indicators";
import { computeCurrencyScores, type ScoredEvent } from "@/lib/macro/scoring";
import { EXTRA_CURRENCIES, type AnyCurrency } from "@/lib/ai/types";

const now = new Date("2026-10-14T14:00:00Z");
const raw = [
  { id: 1, currency: "USD", event: "Core CPI m/m", impact: "high", actual: "0.3%", forecast: "0.3%", previous: "0.3%" },
  { id: 2, currency: "USD", event: "CPI m/m", impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.4%" },
  { id: 3, currency: "USD", event: "CPI y/y", impact: "high", actual: "3.1%", forecast: "3.0%", previous: "2.9%" },
  { id: 4, currency: "EUR", event: "German WPI m/m", impact: "low", actual: "1.9%", forecast: "0.6%", previous: "0.6%" },
  { id: 5, currency: "GBP", event: "CB Leading Index m/m", impact: "low", actual: "-0.1%", forecast: null, previous: "-0.1%" },
  { id: 6, currency: "CNY", event: "M2 Money Supply y/y", impact: "low", actual: "7.2%", forecast: "7.4%", previous: "7.4%" },
  { id: 7, currency: "CNY", event: "New Loans", impact: "medium", actual: "1290B", forecast: "1450B", previous: "590B" },
  { id: 8, currency: "CAD", event: "Building Permits m/m", impact: "low", actual: "8.8%", forecast: "2.9%", previous: "-0.1%" },
  { id: 9, currency: "USD", event: "FOMC Member Waller Speaks", impact: "low", actual: null, forecast: null, previous: null },
  { id: 10, currency: "JPY", event: "Bank Holiday", impact: "holiday", actual: null, forecast: null, previous: null },
  { id: 11, currency: "NZD", event: "FPI m/m", impact: "low", actual: "0.5%", forecast: null, previous: "0.2%" }, // indicador fora da tabela → regra genérica
];

function toScored(): ScoredEvent[] {
  return raw.filter((r) => r.actual !== null).map((r) => {
    const c = classifyRelease({ event: r.event, impact: r.impact, actual: r.actual, forecast: r.forecast, previous: r.previous });
    return {
      event_id: r.id, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact as ScoredEvent["impact"], released_at: new Date("2026-10-14T12:30:00Z"), superseded: false,
      category: c.category, importance: IMPACT_TO_IMPORTANCE[r.impact], classification: c.classification, confidence: c.confidence,
      actual: r.actual, forecast: r.forecast, previous: r.previous, surprise: c.surprise, reference_basis: c.reference_basis, rule_id: c.rule_id, explanation: c.explanation,
    };
  });
}

describe("cobertura total: toda moeda com Actual é analisada", () => {
  it("indicadores da spec têm regra (WPI, Leading Index, M2, New Loans, Building Permits, CPI)", () => {
    const wpi = classifyRelease({ event: "German WPI m/m", impact: "low", actual: "1.9%", forecast: "0.6%", previous: "0.6%" });
    expect(wpi.rule_id).toBe("inflation"); expect(wpi.direction).toBe("BULLISH"); expect(wpi.classification).not.toBe("UNKNOWN");
    const lead = classifyRelease({ event: "CB Leading Index m/m", impact: "low", actual: "-0.1%", forecast: null, previous: "-0.1%" });
    expect(lead.rule_id).toBe("leading_index"); expect(lead.classification).toBe("NEUTRAL"); expect(lead.reference_basis).toBe("PREVIOUS");
    const m2 = classifyRelease({ event: "M2 Money Supply y/y", impact: "low", actual: "7.2%", forecast: "7.4%", previous: "7.4%" });
    expect(m2.rule_id).toBe("credit"); expect(m2.direction).toBe("BEARISH");
    const loans = classifyRelease({ event: "New Loans", impact: "medium", actual: "1290B", forecast: "1450B", previous: "590B" });
    expect(loans.rule_id).toBe("credit"); expect(loans.direction).toBe("BEARISH");
    const permits = classifyRelease({ event: "Building Permits m/m", impact: "low", actual: "8.8%", forecast: "2.9%", previous: "-0.1%" });
    expect(permits.rule_id).toBe("housing"); expect(permits.classification).toBe("VERY_BULLISH");
    const core = classifyRelease({ event: "Core CPI m/m", impact: "high", actual: "0.3%", forecast: "0.3%", previous: "0.3%" });
    expect(core.rule_id).toBe("inflation"); expect(core.classification).toBe("NEUTRAL");
  });

  it("sinal depende do indicador: desemprego/claims/estoques/déficit acima = BEARISH; demais acima = BULLISH", () => {
    expect(classifyRelease({ event: "Unemployment Rate", impact: "high", actual: "4.5%", forecast: "4.3%", previous: "4.3%" }).direction).toBe("BEARISH");
    expect(classifyRelease({ event: "Unemployment Claims", impact: "medium", actual: "250K", forecast: "230K", previous: "228K" }).direction).toBe("BEARISH");
    expect(classifyRelease({ event: "Public Sector Net Borrowing", impact: "low", actual: "20.1B", forecast: "15.0B", previous: "14.2B" }).direction).toBe("BEARISH");
    expect(classifyRelease({ event: "Business Inventories m/m", impact: "low", actual: "0.6%", forecast: "0.2%", previous: "0.2%" }).direction).toBe("BEARISH");
    expect(classifyRelease({ event: "Retail Sales m/m", impact: "high", actual: "0.8%", forecast: "0.3%", previous: "0.1%" }).direction).toBe("BULLISH");
  });

  it("indicador fora da tabela com Actual numérico usa regra genérica (confiança LOW), nunca UNKNOWN", () => {
    const fpi = classifyRelease({ event: "FPI m/m", impact: "low", actual: "0.5%", forecast: null, previous: "0.2%" });
    expect(fpi.rule_id).toBe("generic_higher_is_better"); expect(fpi.direction).toBe("BULLISH"); expect(fpi.confidence).toBe("LOW");
    expect(fpi.explanation).toContain("regra genérica");
    const inverse = classifyRelease({ event: "Mortgage Delinquencies", impact: "low", actual: "4.0%", forecast: null, previous: "3.5%" });
    expect(inverse.rule_id).toBe("generic_higher_is_worse"); expect(inverse.direction).toBe("BEARISH");
    // Sem Actual continua UNKNOWN (pendente) — a regra genérica não inventa dado.
    expect(classifyRelease({ event: "Some Unknown Index", impact: "low", actual: null, forecast: "1", previous: "1" }).classification).toBe("UNKNOWN");
    // Feriado/leilão/estoque de petróleo nunca pontuam.
    expect(classifyRelease({ event: "Crude Oil Inventories", impact: "low", actual: "3.5M", forecast: "1.0M", previous: "-2.0M" }).classification).toBe("UNKNOWN");
    expect(classifyRelease({ event: "10-y Bond Auction", impact: "low", actual: "4.21|2.5", forecast: null, previous: "4.10|2.4" }).classification).toBe("UNKNOWN");
  });

  it("ranking G8: USD, EUR, GBP, CAD e NZD avaliadas; JPY/CHF/AUD sem evidência; confiança sempre 1..99%", () => {
    const scores = computeCurrencyScores({ events: toScored(), now });
    const by = Object.fromEntries(scores.map((s) => [s.currency, s]));
    for (const c of ["USD", "EUR", "GBP", "CAD", "NZD"]) expect(by[c].status, c).toBe("EVALUATED");
    for (const c of ["JPY", "CHF", "AUD"]) { expect(by[c].status, c).toBe("INSUFFICIENT_EVIDENCE"); expect(by[c].score).toBeNull(); expect(by[c].confidence_pct).toBeNull(); }
    for (const s of scores.filter((x) => x.status === "EVALUATED")) { expect(s.confidence_pct).toBeGreaterThanOrEqual(1); expect(s.confidence_pct).toBeLessThanOrEqual(99); expect(s.drivers.length).toBeGreaterThan(0); }
    // GBP: surpresa zero → score 0, mas AVALIADA (evidência fraca/neutra), não "sem dado".
    expect(by.GBP.score_display).toBe(0); expect(by.GBP.rank).not.toBeNull(); expect(by.GBP.evidence_level).toBe("WEAK");
    // CAD (permits muito acima) e EUR (WPI muito acima) positivas; USD CPI levemente acima = positiva.
    expect(by.CAD.score_display!).toBeGreaterThan(0); expect(by.EUR.score_display!).toBeGreaterThan(0); expect(by.USD.score_display!).toBeGreaterThan(0);
    // Ordem forte → fraca.
    const ranked = scores.filter((s) => s.status === "EVALUATED");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score_display!).toBeGreaterThanOrEqual(ranked[i].score_display!);
    // CNY não entra no ranking G8.
    expect(scores.some((s) => (s.currency as string) === "CNY")).toBe(false);
  });

  it("CNY (fora do G8) é avaliada à parte com os mesmos critérios: M2 + New Loans abaixo = negativa", () => {
    const extra = computeCurrencyScores({ events: toScored().filter((e) => (EXTRA_CURRENCIES as readonly string[]).includes(e.currency)), now, currencies: EXTRA_CURRENCIES }).filter((s) => s.status === "EVALUATED");
    expect(extra.map((s) => s.currency as string)).toEqual(["CNY"]);
    expect(extra[0].score_display!).toBeLessThan(0); expect(extra[0].live_events).toBe(2); expect(extra[0].bias).not.toBe("LONG");
    expect(extra[0].confidence_pct).toBeGreaterThanOrEqual(1);
  });
});
