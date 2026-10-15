/** Spec "CORREÇÃO AVANÇADA — motor de score, confiança e ranking" (v3-strength).
 *  Cenário: USD 4× CPI (+,+,+,0) · JPY Core Machinery Orders 5,2 vs 2,2 · EUR WPI 1,9 vs 0,6 · CAD Permits 8,8 vs 2,9 ·
 *  GBP Leading Index −0,1 vs −0,1 · AUD Employment −39,3K vs +19,6K e Unemployment 4,7 vs 4,6 · CNY M2 + New Loans · CHF/NZD sem dado. */
import { describe, it, expect } from "vitest";
import { classifyRelease, IMPACT_TO_IMPORTANCE } from "@/lib/macro/indicators";
import { computeCurrencyScores, confidenceV3, eventScore, magnitudeFromRatio, surpriseRatio, type ScoredEvent } from "@/lib/macro/scoring";
import { DEFAULT_SCORING_CONFIG } from "@/lib/macro/config";
import { buildTradeCandidates } from "@/lib/macro/pairs";
import { EXTRA_CURRENCIES, type AnyCurrency } from "@/lib/ai/types";

const now = new Date("2026-10-14T14:00:00Z");
const raw = [
  { id: 1, currency: "USD", event: "Core CPI m/m", impact: "high", actual: "0.3%", forecast: "0.3%", previous: "0.3%" },
  { id: 2, currency: "USD", event: "CPI m/m", impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.4%" },
  { id: 3, currency: "USD", event: "CPI y/y", impact: "high", actual: "3.1%", forecast: "3.0%", previous: "2.9%" },
  { id: 4, currency: "USD", event: "Core CPI y/y", impact: "high", actual: "3.1%", forecast: "3.0%", previous: "3.1%" },
  { id: 5, currency: "JPY", event: "Core Machinery Orders m/m", impact: "low", actual: "5.2%", forecast: "2.2%", previous: "-4.6%" },
  { id: 6, currency: "EUR", event: "German WPI m/m", impact: "low", actual: "1.9%", forecast: "0.6%", previous: "0.6%" },
  { id: 7, currency: "CAD", event: "Building Permits m/m", impact: "low", actual: "8.8%", forecast: "2.9%", previous: "-0.1%" },
  { id: 8, currency: "GBP", event: "CB Leading Index m/m", impact: "low", actual: "-0.1%", forecast: null, previous: "-0.1%" },
  { id: 9, currency: "AUD", event: "Employment Change", impact: "high", actual: "-39.3K", forecast: "19.6K", previous: "24.5K" },
  { id: 10, currency: "AUD", event: "Unemployment Rate", impact: "high", actual: "4.7%", forecast: "4.6%", previous: "4.5%" },
  { id: 11, currency: "CNY", event: "M2 Money Supply y/y", impact: "low", actual: "7.2%", forecast: "7.4%", previous: "7.4%" },
  { id: 12, currency: "CNY", event: "New Loans", impact: "medium", actual: "1290B", forecast: "1450B", previous: "590B" },
  { id: 13, currency: "USD", event: "FOMC Member Waller Speaks", impact: "low", actual: null, forecast: null, previous: null },
];

function toScored(rows = raw): ScoredEvent[] {
  return rows.filter((r) => r.actual !== null).map((r) => {
    const c = classifyRelease({ event: r.event, impact: r.impact, actual: r.actual, forecast: r.forecast, previous: r.previous });
    return {
      event_id: r.id, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact as ScoredEvent["impact"], released_at: new Date("2026-10-14T12:30:00Z"), superseded: false,
      category: c.category, importance: IMPACT_TO_IMPORTANCE[r.impact], classification: c.classification, confidence: c.confidence,
      actual: r.actual, forecast: r.forecast, previous: r.previous, surprise: c.surprise, reference_basis: c.reference_basis, rule_id: c.rule_id, explanation: c.explanation, threshold: c.threshold,
    };
  });
}
const scores = computeCurrencyScores({ events: toScored(), now });
const by = Object.fromEntries(scores.map((s) => [s.currency, s]));

describe("v3-strength: score do evento (−5..+5) normalizado pela natureza do indicador", () => {
  it("surpresa normalizada: 1,3 p.p. de WPI, 3,0 p.p. de máquinas e −58,9K de emprego ficam numa escala comparável (0..5), sem explodir", () => {
    const ev = toScored();
    const wpi = ev.find((e) => e.event.startsWith("German WPI"))!, mach = ev.find((e) => e.event.startsWith("Core Machinery"))!, emp = ev.find((e) => e.event === "Employment Change")!;
    for (const e of [wpi, mach, emp]) { const es = eventScore(e); expect(Math.abs(es.score)).toBeLessThanOrEqual(5); expect(Math.abs(es.score)).toBeGreaterThan(0.5); }
    expect(magnitudeFromRatio(1)).toBeCloseTo(1.667, 2); expect(magnitudeFromRatio(1e9)).toBeLessThanOrEqual(5);
    expect(surpriseRatio({ surprise: 1.3, threshold: 0.1, classification: "VERY_BULLISH" })).toBeCloseTo(13, 5);
    // New Loans (bilhões): limiar relativo — nunca o limiar absoluto de 0,1 pensado para p.p.
    const loans = classifyRelease({ event: "New Loans", impact: "medium", actual: "1290B", forecast: "1450B", previous: "590B" });
    expect(loans.threshold!).toBeGreaterThan(1e9); expect(Math.abs(loans.surprise!) / loans.threshold!).toBeLessThan(10);
    // Forecast ≈ 0 não gera score gigantesco (limiar relativo usa no mínimo |ref| = 1).
    const tiny = classifyRelease({ event: "Building Permits m/m", impact: "low", actual: "0.5%", forecast: "0.01%", previous: "0.0%" });
    expect(Math.abs(eventScore({ ...toScored()[0], surprise: tiny.surprise, threshold: tiny.threshold, classification: tiny.classification, category: tiny.category, impact: "low", actual: "0.5%", forecast: "0.01%", previous: "0.0%" }).score)).toBeLessThanOrEqual(5);
  });
  it("direção econômica: emprego negativo e desemprego acima ⇒ ambos negativos para AUD; CPI acima ⇒ positivo para USD", () => {
    const aud = by.AUD.drivers; expect(aud.every((d) => d.direction === "BEARISH")).toBe(true);
    expect(by.USD.drivers.filter((d) => d.direction === "BULLISH").length).toBe(3); expect(by.USD.drivers.filter((d) => d.direction === "NEUTRAL").length).toBe(1);
  });
  it("checagem do previous: CPI y/y 3,1 vs prev 2,9 confirma; New Loans 1290B vs prev 590B contradiz a leitura negativa", () => {
    expect(by.USD.drivers.find((d) => d.event === "CPI y/y")!.previous_check).toBe("agrees");
    const cny = computeCurrencyScores({ events: toScored().filter((e) => e.currency === "CNY"), now, currencies: EXTRA_CURRENCIES }).find((s) => (s.currency as string) === "CNY")!;
    expect(cny.drivers.find((d) => d.event === "New Loans")!.previous_check).toBe("disagrees");
  });
});

describe("v3-strength: agregação, viés e ranking por força", () => {
  it("todas as moedas com Actual avaliadas; CHF/NZD sem evidência (sem score, sem confiança, sem rank)", () => {
    for (const c of ["USD", "JPY", "EUR", "CAD", "GBP", "AUD"]) expect(by[c].status, c).toBe("EVALUATED");
    for (const c of ["CHF", "NZD"]) { expect(by[c].status).toBe("INSUFFICIENT_EVIDENCE"); expect(by[c].score).toBeNull(); expect(by[c].confidence_pct).toBeNull(); expect(by[c].rank).toBeNull(); }
  });
  it("viés: USD positivo (4 CPI), JPY/EUR/CAD positivos com UM evento forte, GBP neutro, AUD forte negativo", () => {
    expect(["STRONG", "VERY_STRONG"]).toContain(by.USD.classification);
    for (const c of ["JPY", "EUR", "CAD"]) { expect(by[c].score_display!).toBeGreaterThanOrEqual(0.75); expect(["STRONG", "VERY_STRONG", "MODERATELY_STRONG"]).toContain(by[c].classification); }
    expect(by.GBP.score_display).toBe(0); expect(by.GBP.classification).toBe("NEUTRAL");
    expect(by.AUD.score_display!).toBeLessThanOrEqual(-1.5); expect(by.AUD.classification).toBe("VERY_WEAK");
  });
  it("um único evento forte NÃO tem o score destruído pela quantidade (JPY ≥ +0,75), mas a confiança fica limitada ao teto de 70%", () => {
    expect(by.JPY.live_events).toBe(1); expect(by.JPY.score_display!).toBeGreaterThanOrEqual(0.75);
    expect(by.JPY.confidence_pct!).toBeLessThanOrEqual(70); expect(by.JPY.confidence_pct!).toBeGreaterThanOrEqual(40); // nunca 1–5% artificial
    expect(by.JPY.consistency).toBe("NA");
  });
  it("muitos eventos pequenos não ultrapassam artificialmente um evento macro relevante (média ponderada, não soma)", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, currency: "CHF", event: "Retail Sales m/m", impact: "low", actual: "0.3%", forecast: "0.2%", previous: "0.1%" }));
    const s = computeCurrencyScores({ events: toScored([...raw, ...many]), now });
    const chf = s.find((x) => x.currency === "CHF")!;
    expect(chf.score_display!).toBeLessThan(by.USD.score_display!);
    expect(chf.score_display!).toBeLessThan(2); // 6 beats de 0,1 p.p. em dado secundário não viram "forte positivo"
  });
  it("ranking ordenado por FORÇA (score), da mais forte à mais fraca — nunca por confiança", () => {
    const ranked = scores.filter((s) => s.status === "EVALUATED");
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score_raw!).toBeGreaterThanOrEqual(ranked[i].score_raw!);
    expect(ranked[0].currency).toBe("USD"); expect(ranked[ranked.length - 1].currency).toBe("AUD");
    // há moeda com score maior e confiança menor que outra (as duas métricas são distintas e o ranking preserva a força)
    expect(ranked.some((a) => ranked.some((b) => a.score_raw! > b.score_raw! && a.confidence_pct! < b.confidence_pct!))).toBe(true);
  });
});

describe("v3-strength: confiança = robustez da evidência (1–100), separada do score", () => {
  it("USD: 4 evidências consistentes de alto impacto ⇒ confiança alta (≥ 75%), consistência alta", () => {
    expect(by.USD.live_events).toBe(4); expect(by.USD.confidence_pct!).toBeGreaterThanOrEqual(75); expect(by.USD.consistency).toBe("HIGH");
  });
  it("AUD: 2 evidências consistentes de alto impacto ⇒ confiança alta mas limitada ao teto de 80%", () => {
    expect(by.AUD.confidence_pct!).toBeLessThanOrEqual(80); expect(by.AUD.confidence_pct!).toBeGreaterThanOrEqual(65); expect(by.AUD.confidence_breakdown!.cap_pct).toBe(80);
  });
  it("GBP: evidência fraca/neutra ⇒ confiança baixa/moderada, mas NÃO 'sem dado'", () => {
    expect(by.GBP.status).toBe("EVALUATED"); expect(by.GBP.confidence_pct!).toBeGreaterThanOrEqual(10); expect(by.GBP.confidence_pct!).toBeLessThan(50);
  });
  it("sempre entre 1 e 100; decomposição auditável soma os cinco componentes", () => {
    for (const s of scores.filter((x) => x.status === "EVALUATED")) {
      expect(s.confidence_pct!).toBeGreaterThanOrEqual(1); expect(s.confidence_pct!).toBeLessThanOrEqual(100);
      const b = s.confidence_breakdown!; const w = DEFAULT_SCORING_CONFIG.confidence_weights;
      expect(b.raw_pct).toBe(Math.round(100 * (w.quality * b.quality + w.magnitude * b.magnitude + w.consistency * b.consistency + w.quantity * b.quantity + w.certainty * b.certainty)));
    }
  });
  it("eventos conflitantes (forte + / forte −) ⇒ score moderado e confiança reduzida vs eventos consistentes", () => {
    const base = toScored().filter((e) => e.currency === "AUD");
    const consistent = computeCurrencyScores({ events: base, now }).find((s) => s.currency === "AUD")!;
    const flipped: ScoredEvent = { ...base[1], event_id: 999, event: "Employment Change (prev)", classification: "VERY_BULLISH", surprise: 60000 }; // mesma força, direção oposta
    const conflicted = computeCurrencyScores({ events: [base[0], flipped], now }).find((s) => s.currency === "AUD")!;
    expect(conflicted.conflict).toBe(true); expect(conflicted.consistency).toBe("LOW");
    expect(Math.abs(conflicted.score_display!)).toBeLessThan(Math.abs(consistent.score_display!));
    expect(conflicted.confidence_pct!).toBeLessThan(consistent.confidence_pct!);
    expect(conflicted.confidence_breakdown!.conflict_penalty).toBe(true);
  });
  it("teto por quantidade: 1 ⇒ 70 · 2 ⇒ 80 · 3 ⇒ 90 · 4+ ⇒ 100, mesmo com evidência perfeita", () => {
    const perfect = { w: 3, s: 5, ratio: 10, impact_norm: 1, relevance: 1, basis: 1, quality: 1 };
    expect(confidenceV3([perfect]).pct).toBe(70);
    expect(confidenceV3([perfect, perfect]).pct).toBe(80);
    expect(confidenceV3([perfect, perfect, perfect]).pct).toBe(90);
    expect(confidenceV3([perfect, perfect, perfect, perfect]).pct).toBe(100);
    // um evento ruim/ambíguo fica bem abaixo do teto
    expect(confidenceV3([{ w: 0.3, s: 0.2, ratio: 0.3, impact_norm: 0.25, relevance: 0.4, basis: 0.7, quality: 0.6 }]).pct).toBeLessThan(40);
  });
});

describe("v3-strength: CNY fora do G8 e candidatos", () => {
  it("CNY avaliada à parte com os mesmos critérios (2 evidências), fora do ranking G8", () => {
    expect(scores.some((s) => (s.currency as string) === "CNY")).toBe(false);
    const extra = computeCurrencyScores({ events: toScored().filter((e) => (EXTRA_CURRENCIES as readonly string[]).includes(e.currency)), now, currencies: EXTRA_CURRENCIES }).filter((s) => s.status === "EVALUATED");
    expect(extra.map((s) => s.currency as string)).toEqual(["CNY"]); expect(extra[0].live_events).toBe(2);
    expect(extra[0].confidence_pct!).toBeLessThanOrEqual(80); expect(extra[0].confidence_pct!).toBeGreaterThanOrEqual(1);
  });
  it("perna com evidência fraca (um dado secundário) nunca vira candidato elegível", () => {
    const cands = buildTradeCandidates({ scores, pending: [], cfg: DEFAULT_SCORING_CONFIG, eventRiskFor: () => ({ level: "LOW", events: [] }) });
    const weakLegs = cands.filter((c) => [c.base_currency, c.quote_currency].some((x) => by[x as string]?.evidence_level === "WEAK"));
    expect(weakLegs.length).toBeGreaterThan(0); expect(weakLegs.every((c) => c.eligible === false)).toBe(true);
    const audusd = cands.find((c) => c.symbol === "AUDUSD"); // USD (4 dados) vs AUD (2 dados): ambas sólidas
    expect(audusd?.eligible).toBe(true); expect(audusd?.bias).toBe("SHORT");
  });
});
