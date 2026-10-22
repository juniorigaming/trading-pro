/** Matriz de divergência: sem evidência (score null) nunca aparece como 0.00 — aparece como "—". */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DivergenceMatrix } from "@/components/ai/DivergenceMatrix";
import type { CurrencyScoreView } from "@/lib/ai/types";
import { G8 } from "@/lib/ai/types";

const view = (currency: string, score: number | null): CurrencyScoreView =>
  ({ currency, score, status: score === null ? "INSUFFICIENT_EVIDENCE" : "EVALUATED" }) as unknown as CurrencyScoreView;

describe("DivergenceMatrix — null não vira 0", () => {
  it("só sem evidência: nenhuma célula 0.00 e nenhuma divergência calculada", () => {
    const html = renderToStaticMarkup(<DivergenceMatrix scores={G8.map((c) => view(c, null))} />);
    expect(html).not.toContain("0.00");
    expect(html).toContain("—");
  });

  it("mistura: moeda medida aparece com valor; a sem evidência fica em —, sem 0.00", () => {
    const scores = G8.map((c) => view(c, c === "USD" ? 1.5 : null));
    const html = renderToStaticMarkup(<DivergenceMatrix scores={scores} />);
    expect(html).toContain("3.75");
    expect(html).not.toContain("0.00");
  });
});
