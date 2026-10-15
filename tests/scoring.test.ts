import { describe, it, expect } from "vitest";
import { computeCurrencyScores, baseContribution, decayFactor, classifyScore, momentumFrom, normalizeEventKey, parseNumeric, roundToStep, type ScoredEvent } from "@/lib/macro/scoring";
import { DEFAULT_SCORING_CONFIG } from "@/lib/macro/config";

const now = new Date("2026-10-02T12:00:00Z");
const ev = (p: Partial<ScoredEvent> & { currency: ScoredEvent["currency"] }): ScoredEvent => ({
  event_id: Math.floor(Math.random() * 1e6), event: "Core CPI m/m", impact: "high", released_at: new Date(now.getTime() - 2 * 86_400_000), superseded: false,
  category: "INFLATION", importance: "HIGH", classification: "BULLISH", confidence: "HIGH", ...p,
});

describe("scoring engine", () => {
  it("pesa banco central/CPI mais que sentimento", () => {
    const cb = baseContribution({ category: "CENTRAL_BANK", importance: "HIGH", classification: "BULLISH", confidence: "HIGH", impact: "high" });
    const sent = baseContribution({ category: "SENTIMENT", importance: "LOW", classification: "BULLISH", confidence: "HIGH", impact: "low" });
    expect(cb.base_contribution).toBeGreaterThan(sent.base_contribution * 5);
  });
  it("decai com meia-vida e BC persiste mais", () => {
    expect(decayFactor("INFLATION", 0)).toBe(1);
    expect(decayFactor("GROWTH", 5)).toBeCloseTo(0.5, 5);
    expect(decayFactor("CENTRAL_BANK", 14)).toBeCloseTo(0.5, 5);
    expect(decayFactor("GROWTH", 100)).toBe(0);
  });
  it("classifica (v3: ±0.60/±0.30/±0.10 nativo = ±1.50/±0.75/±0.25 na escala −5..+5) e arredonda em passos", () => {
    expect(roundToStep(1.13, 0.25)).toBe(1.25); expect(roundToStep(0.63, 0.05)).toBe(0.65);
    expect(classifyScore(0.6)).toBe("VERY_STRONG"); expect(classifyScore(0.3)).toBe("STRONG"); expect(classifyScore(0.1)).toBe("MODERATELY_STRONG");
    expect(classifyScore(0)).toBe("NEUTRAL"); expect(classifyScore(0.05)).toBe("NEUTRAL"); expect(classifyScore(-0.1)).toBe("MODERATELY_WEAK"); expect(classifyScore(-0.3)).toBe("WEAK"); expect(classifyScore(-0.6)).toBe("VERY_WEAK");
  });
  it("gera ranking 1–8 com scores coerentes e delta/momentum", () => {
    const events: ScoredEvent[] = [
      ev({ currency: "EUR", classification: "VERY_BULLISH" }), ev({ currency: "EUR", classification: "BULLISH", category: "GROWTH", importance: "MEDIUM_HIGH" }),
      ev({ currency: "USD", classification: "BULLISH" }), ev({ currency: "USD", classification: "BULLISH", category: "EMPLOYMENT" }),
      ev({ currency: "AUD", classification: "BEARISH" }), ev({ currency: "AUD", classification: "VERY_BEARISH", category: "CENTRAL_BANK" }),
      ev({ currency: "JPY", classification: "NEUTRAL" }),
    ];
    const scores = computeCurrencyScores({ events, now, previousScores: { USD: 0.3, AUD: 1.0 } });
    expect(scores).toHaveLength(8);
    const evaluated = scores.filter((s) => s.status === "EVALUATED");
    expect(evaluated.map((s) => s.rank)).toEqual(evaluated.map((_, i) => i + 1));
    expect(scores.filter((s) => s.status !== "EVALUATED").every((s) => s.rank === null && s.score === null)).toBe(true);
    expect(evaluated[0].currency).toBe("EUR");
    expect(evaluated[evaluated.length - 1].currency).toBe("AUD");
    const usd = scores.find((s) => s.currency === "USD")!;
    // v3: sem surpresa/limiar, BULLISH ≈ 1 limiar ⇒ magnitude 1.67 (−5..+5) ⇒ 0.667 nativo ⇒ passo 0.05 = 0.65
    expect(usd.score).toBe(0.65); expect(usd.score_delta).toBeCloseTo(0.35, 5); expect(usd.momentum).toBe("STRENGTHENING");
    const aud = scores.find((s) => s.currency === "AUD")!;
    expect(aud.score).toBeLessThan(-0.6); expect(aud.classification).toBe("VERY_WEAK"); expect(aud.momentum).toBe("NARRATIVE_SHIFT");
    for (const s of scores) if (s.score !== null) { expect(s.score).toBeLessThanOrEqual(2); expect(s.score).toBeGreaterThanOrEqual(-2); }
  });
  it("ignora eventos superseded e feriados", () => {
    const events = [ev({ currency: "GBP", classification: "VERY_BULLISH", superseded: true }), ev({ currency: "GBP", classification: "BEARISH", impact: "holiday" })];
    const gbp = computeCurrencyScores({ events, now }).find((s) => s.currency === "GBP")!;
    // Sem evidência mensurada: score = null (NUNCA 0), sem posição, status explícito.
    expect(gbp.score).toBeNull(); expect(gbp.status).toBe("INSUFFICIENT_EVIDENCE"); expect(gbp.rank).toBeNull();
    expect(gbp.live_events).toBe(0); expect(gbp.confidence).toBe("INSUFFICIENT_EVIDENCE"); expect(gbp.confidence_pct).toBeNull();
  });
  it("momentum: estável/enfraquecendo", () => {
    expect(momentumFrom(1, 1)).toBe("STABLE"); expect(momentumFrom(0.5, 1)).toBe("WEAKENING"); expect(momentumFrom(1, null)).toBeNull();
  });
  it("normaliza event_key e parse numérico", () => {
    expect(normalizeEventKey("USD", "Core CPI m/m")).toBe("USD|core_cpi_m_m");
    expect(normalizeEventKey("EUR", "Flash Services PMI")).toBe(normalizeEventKey("EUR", "Final Services PMI"));
    expect(parseNumeric("2.4%")).toBe(2.4); expect(parseNumeric("-0.1")).toBe(-0.1); expect(parseNumeric("150K")).toBe(150000); expect(parseNumeric(null)).toBeNull(); expect(parseNumeric("—")).toBeNull();
  });
  it("config default tem versão", () => { expect(DEFAULT_SCORING_CONFIG.version).toMatch(/^v\d/); });
});
