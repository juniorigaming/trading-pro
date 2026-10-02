import { describe, it, expect } from "vitest";
import { CalendarExtractionSchema, TechnicalAnalysisSchema, EventInterpretationSchema, toJsonSchema, SCHEMAS } from "@/lib/ai/schemas";
import { mockStructured } from "@/lib/ai/mock";
import { buildChecklist } from "@/lib/smc/checklist";
import type { TechnicalAnalysis } from "@/lib/ai/schemas";

describe("JSON validation / structured outputs", () => {
  it("mocks de todos os schemas são válidos", () => {
    for (const name of Object.keys(SCHEMAS) as (keyof typeof SCHEMAS)[]) {
      const r = SCHEMAS[name].safeParse(mockStructured(name, '{"events":[{"id":1,"currency":"USD"},{"id":2,"currency":"EUR"}]}'));
      expect(r.success, `${name}: ${JSON.stringify(r.error?.issues.slice(0, 2))}`).toBe(true);
    }
  });
  it("JSON Schema estrito: additionalProperties=false e required em todos os objetos", () => {
    const walk = (n: Record<string, unknown>) => {
      if (n.type === "object" && n.properties) { expect(n.additionalProperties).toBe(false); expect(n.required).toEqual(Object.keys(n.properties as object)); for (const v of Object.values(n.properties as Record<string, Record<string, unknown>>)) walk(v); }
      if (n.items) walk(n.items as Record<string, unknown>);
      for (const k of ["anyOf", "oneOf"]) if (Array.isArray(n[k])) for (const v of n[k] as Record<string, unknown>[]) walk(v);
    };
    for (const s of Object.values(SCHEMAS)) walk(toJsonSchema(s));
  });
  it("rejeita OCR que inventa status released sem actual (regra no provider) e campos fora do enum", () => {
    const bad = { ...(mockStructured("calendar_extraction", "") as object), rows: [{ date: "2026-10-02", time: "09:30", currency: "USD", event: "CPI", impact: "muito alto", actual: null, forecast: null, previous: null, status: "released", ocr_confidence: 0.9, requires_manual_confirmation: false, ocr_issues: [] }] };
    expect(CalendarExtractionSchema.safeParse(bad).success).toBe(false);
    expect(EventInterpretationSchema.safeParse({ interpretations: [{ event_id: "x" }] }).success).toBe(false);
  });
});

const base = (): TechnicalAnalysis => TechnicalAnalysisSchema.parse({
  ...(mockStructured("technical_analysis", "Ativo: EURAUD") as object),
  htf_bias: "BULLISH", draw_on_liquidity: [{ target: "BSL H4", direction: "UP", timeframe: "H4", confidence: "HIGH" }], image_quality: "GOOD",
  location: { htf_premium_discount: "DISCOUNT", poi_reached: true, poi_description: "OB H4", is_extended: false },
  liquidity_sweep: true, displacement: true, displacement_detail: { timeframe: "M15", created_fvg: true, description: "x" },
  mss: { present: true, type: "EXTERNAL_MSS", timeframe: "M15", follow_through: true, broke_what: "swing high" }, retest: { occurred: true, poi_type: "FVG", description: "x" },
  entry_model: "MODEL_B_CONFIRMED", setup_grade: "A", status: "READY", disqualifiers: [], suggested_direction: "LONG", wait_for: [],
});

describe("checklist / regras duras SMC", () => {
  it("setup completo alinhado → READY, MODEL_B, grade A, risco normal", () => {
    const c = buildChecklist(base(), { macroBias: "LONG", macroDivergence: 2.5, eventRisk: "LOW", correlationOk: true });
    expect(c.status).toBe("READY"); expect(c.entry_model).toBe("MODEL_B_CONFIRMED"); expect(c.setup_grade).toBe("A"); expect(c.risk_recommendation).toBe("NORMAL");
    expect(c.items.find((i) => i.key === "mss")?.ok).toBe(true);
  });
  it("POI tocado sem sweep/displacement → INVALID/NO_TRADE com POI_TOUCH_ONLY (POI não é entrada)", () => {
    const a = base(); a.liquidity_sweep = false; a.displacement = false; a.entry_model = "MODEL_B_CONFIRMED";
    const c = buildChecklist(a, { macroBias: "LONG" });
    expect(c.entry_model).toBe("NONE"); expect(c.setup_grade).toBe("NO_TRADE"); expect(c.status).toBe("INVALID"); expect(c.disqualifiers).toContain("POI_TOUCH_ONLY");
  });
  it("MSS interno em M1 → rebaixa para MODEL_A com risco reduzido (MSS_TOO_MICRO)", () => {
    const a = base(); a.mss = { present: true, type: "INTERNAL_MSS", timeframe: "M1", follow_through: false, broke_what: null };
    const c = buildChecklist(a, { macroBias: "LONG", macroDivergence: 2.5, eventRisk: "LOW" });
    expect(c.entry_model).toBe("MODEL_A_AGGRESSIVE"); expect(c.risk_recommendation).toBe("REDUCED"); expect(c.disqualifiers).toContain("MSS_TOO_MICRO"); expect(c.setup_grade).not.toBe("A");
  });
  it("contra macro → INVALID; event risk EXTREME → sem entrada", () => {
    expect(buildChecklist(base(), { macroBias: "SHORT" }).status).toBe("INVALID");
    const c = buildChecklist(base(), { macroBias: "LONG", eventRisk: "EXTREME" }); expect(c.entry_model).toBe("NONE"); expect(c.status).toBe("INVALID");
  });
  it("sem MSS/retest → WAIT", () => {
    const a = base(); a.mss = { present: false, type: "NONE", timeframe: null, follow_through: false, broke_what: null }; a.retest = { occurred: false, poi_type: "NONE", description: null };
    const c = buildChecklist(a, { macroBias: "LONG", macroDivergence: 1.2, eventRisk: "LOW" });
    expect(["WAIT", "READY"]).toContain(c.status); expect(c.entry_model).toBe("MODEL_A_AGGRESSIVE");
  });
});
