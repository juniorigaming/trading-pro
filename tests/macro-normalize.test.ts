import { describe, it, expect } from "vitest";
import { dbErrorMessage, normalizeCategory, normalizeClassification, normalizeConfidence, normalizeImportance, normalizeInterpretationEnums } from "@/lib/macro/normalize";

describe("normalização defensiva dos enums da IA", () => {
  it("mantém valores canônicos sem marcar alteração", () => {
    for (const v of ["VERY_BULLISH", "BULLISH", "NEUTRAL", "BEARISH", "VERY_BEARISH"]) {
      const r = normalizeClassification(v); expect(r.value).toBe(v); expect(r.changed).toBe(false);
    }
    expect(normalizeImportance("MEDIUM_HIGH").changed).toBe(false);
    expect(normalizeConfidence("LOW").changed).toBe(false);
    expect(normalizeCategory("CENTRAL_BANK").changed).toBe(false);
  });
  it("corrige casing, espaços, hífens e sinônimos", () => {
    expect(normalizeClassification("bullish").value).toBe("BULLISH");
    expect(normalizeClassification(" very bearish ").value).toBe("VERY_BEARISH");
    expect(normalizeClassification("Very-Bullish").value).toBe("VERY_BULLISH");
    expect(normalizeClassification("STRONGLY_BULLISH").value).toBe("VERY_BULLISH");
    expect(normalizeClassification("hawkish").value).toBe("BULLISH");
    expect(normalizeClassification("negative").value).toBe("BEARISH");
    expect(normalizeClassification("BULLISH_FOR_USD").value).toBe("BULLISH");
    expect(normalizeClassification("very_bullish_usd").value).toBe("VERY_BULLISH");
    expect(normalizeImportance("medium high").value).toBe("MEDIUM_HIGH");
    expect(normalizeImportance("critical").value).toBe("HIGH");
    expect(normalizeConfidence("moderate").value).toBe("MEDIUM");
    expect(normalizeCategory("monetary policy").value).toBe("CENTRAL_BANK");
    expect(normalizeCategory("labour").value).toBe("EMPLOYMENT");
  });
  it("cai em fallback seguro para lixo/null e reporta as correções", () => {
    expect(normalizeClassification(null).value).toBe("NEUTRAL");
    expect(normalizeClassification("???").value).toBe("NEUTRAL");
    expect(normalizeImportance(undefined).value).toBe("MEDIUM");
    expect(normalizeConfidence(42).value).toBe("LOW");
    expect(normalizeCategory("").value).toBe("OTHER");
    const r = normalizeInterpretationEnums({ category: "inflation", importance: "HIGH", classification: "Bullish", confidence: "HIGH" });
    expect(r.enums).toEqual({ category: "INFLATION", importance: "HIGH", classification: "BULLISH", confidence: "HIGH" });
    expect(r.fixes).toEqual(['category "inflation" → INFLATION', 'classification "Bullish" → BULLISH']);
  });
  it("dbErrorMessage expõe constraint/detail do driver pg (em .cause)", () => {
    const e = Object.assign(new Error("Failed query: insert into ..."), { cause: { message: 'new row for relation "macro_interpretations" violates check constraint "macro_interpretations_classification_check"', constraint: "macro_interpretations_classification_check", code: "23514" } });
    const m = dbErrorMessage(e);
    expect(m).toContain("violates check constraint");
    expect(m).toContain("constraint=macro_interpretations_classification_check");
    expect(m).toContain("code=23514");
    expect(dbErrorMessage(new Error("x"))).toBe("x");
  });
});
