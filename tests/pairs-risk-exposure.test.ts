import { describe, it, expect } from "vitest";
import { buildTradeCandidates, conventionalPair, divergenceMatrix, filterEligibleTradeCandidates, G8_PAIRS, splitSymbol } from "@/lib/macro/pairs";
import { eventRiskFor, maxRisk } from "@/lib/macro/event-risk";
import { computeExposure, wouldIncreaseConcentration } from "@/lib/macro/exposure";
import type { CurrencyScoreView, PendingEventView } from "@/lib/ai/types";

const mk = (currency: CurrencyScoreView["currency"], score: number, confidence: CurrencyScoreView["confidence"] = "HIGH"): CurrencyScoreView => ({
  currency, score, score_raw: score, status: "EVALUATED", confidence_pct: null, score_display: null, excluded_events: [], previous_score: null, score_delta: null, momentum: null, classification: "NEUTRAL", bias: score > 0 ? "BULLISH" : score < 0 ? "BEARISH" : "NEUTRAL", confidence, rank: 0, live_events: 2, drivers: [],
});
const scores = [mk("USD", 1.25), mk("EUR", 1.5), mk("GBP", 0.5), mk("JPY", 2.0), mk("CHF", 0.75), mk("CAD", 0), mk("AUD", -1.0), mk("NZD", -1.5, "LOW")];
const pend = (currency: PendingEventView["currency"], impact: string, minutes: number): PendingEventView => ({ id: 1, currency, event: "X", scheduled_at: "", impact, forecast: null, previous: null, minutes_until: minutes });

describe("pares / divergência", () => {
  it("28 pares com convenção de mercado", () => {
    expect(G8_PAIRS).toHaveLength(28);
    expect(conventionalPair("JPY", "NZD").symbol).toBe("NZDJPY");
    expect(conventionalPair("USD", "EUR").symbol).toBe("EURUSD");
    expect(splitSymbol("EURUSD.s")).toEqual({ base: "EUR", quote: "USD" });
  });
  it("EUR +1.5 vs AUD -1.0 → EURAUD LONG 2.5; JPY +2 vs NZD -1.5 → NZDJPY SHORT 3.5", () => {
    const c = buildTradeCandidates({ scores, pending: [], eventRiskFor: () => ({ level: "LOW", events: [] }) });
    const eurAud = c.find((x) => x.symbol === "EURAUD")!; expect(eurAud.bias).toBe("LONG"); expect(eurAud.macro_divergence).toBe(2.5); expect(eurAud.strong_currency).toBe("EUR");
    const nzdJpy = c.find((x) => x.symbol === "NZDJPY")!; expect(nzdJpy.bias).toBe("SHORT"); expect(nzdJpy.macro_divergence).toBe(3.5); expect(nzdJpy.confidence).toBe("LOW");
    expect(c[0].symbol).toBe("NZDJPY"); expect(c[0].priority).toBe(1);
    expect(c.every((x) => x.macro_divergence >= 1.0)).toBe(true);
  });
  it("mantém scores e divergência do candidato na mesma escala exibida no ranking", () => {
    const withDisplay = scores.map((s) => ({
      ...s,
      score_display: s.currency === "EUR" ? 3.76 : s.currency === "AUD" ? -2.51 : Number((s.score! * 2.5).toFixed(2)),
    }));
    const eurAud = buildTradeCandidates({ scores: withDisplay, pending: [], maxCandidates: G8_PAIRS.length, eventRiskFor: () => ({ level: "LOW", events: [] }) }).find((x) => x.symbol === "EURAUD")!;
    expect(eurAud.base_score).toBe(3.76);
    expect(eurAud.quote_score).toBe(-2.51);
    expect(eurAud.relative_strength).toBe(6.27);
    expect(eurAud.macro_divergence).toBe(2.5); // escala nativa preservada para consumidores internos
  });
  it("não apresenta pares com evidência fraca como candidatos e marca risco sem calendário como não avaliado", () => {
    const withEvidence = scores.map((s) => ({ ...s, confidence_pct: 85, evidence_level: s.currency === "CHF" ? "WEAK" as const : "STRONG" as const }));
    const candidates = buildTradeCandidates({ scores: withEvidence, pending: [], calendarProvided: false, maxCandidates: G8_PAIRS.length, eventRiskFor: () => ({ level: "LOW", events: [] }) });
    const usdChf = candidates.find((x) => x.symbol === "USDCHF");
    expect(usdChf?.eligible).toBe(false);
    expect(usdChf?.ineligible_reason).toMatch(/evidência fraca/i);
    expect(usdChf?.event_risk_assessed).toBe(false);
    expect(filterEligibleTradeCandidates(candidates, true).some((x) => x.symbol === "USDCHF")).toBe(false);
    expect(candidates.some((x) => x.symbol === "EURAUD" && x.eligible)).toBe(true);
    expect(filterEligibleTradeCandidates(candidates, true, ["EURAUD"]).some((x) => x.symbol === "EURAUD")).toBe(false);
    expect(filterEligibleTradeCandidates(candidates, false)).toEqual([]);
  });
  it("matriz linha − coluna", () => { const m = divergenceMatrix(scores); expect(m.EUR.AUD).toBe(2.5); expect(m.AUD.EUR).toBe(-2.5); });
});

describe("event risk", () => {
  it("LOW sem eventos; MEDIUM com medium; HIGH com high; EXTREME nas duas pernas", () => {
    expect(eventRiskFor(["USD"], []).level).toBe("LOW");
    expect(eventRiskFor(["USD"], [pend("USD", "medium", 300)]).level).toBe("MEDIUM");
    expect(eventRiskFor(["JPY"], [pend("JPY", "high", 120)]).level).toBe("HIGH");
    expect(eventRiskFor(["AUD", "JPY"], [pend("AUD", "high", 30), pend("JPY", "high", 180)]).level).toBe("EXTREME");
    expect(eventRiskFor(["AUD"], [pend("AUD", "high", 30)]).level).toBe("EXTREME"); // high em ≤60min
  });
  it("ignora eventos fora da janela e de outras moedas", () => {
    expect(eventRiskFor(["EUR"], [pend("USD", "high", 60), pend("EUR", "high", 60 * 30)]).level).toBe("LOW");
  });
  it("maxRisk", () => { expect(maxRisk("MEDIUM", "EXTREME")).toBe("EXTREME"); });
});

describe("exposição / correlação", () => {
  it("short AUDUSD + AUDCHF + AUDJPY = AUD -3 e alerta", () => {
    const r = computeExposure([{ symbol: "AUDUSD", direction: "SELL" }, { symbol: "AUDCHF", direction: "SELL" }, { symbol: "AUDJPY", direction: "SELL" }]);
    expect(r.exposure).toEqual({ AUD: -3, USD: 1, CHF: 1, JPY: 1 });
    expect(r.alerts.some((a) => a.level === "DANGER" && a.currency === "AUD" && /weakness/.test(a.message))).toBe(true);
    expect(r.correlatedGroups.find((g) => g.currency === "AUD")?.symbols).toHaveLength(3);
  });
  it("detecta aumento de concentração", () => {
    const r = computeExposure([{ symbol: "AUDUSD", direction: "SELL" }]);
    expect(wouldIncreaseConcentration(r, "AUDJPY", "SHORT").ok).toBe(false);
    expect(wouldIncreaseConcentration(r, "EURGBP", "LONG").ok).toBe(true);
  });
});
