/**
 * EconomicDataProvider — abstração da ORIGEM dos dados do calendário.
 * O restante do sistema só conhece EconomicEventInput[].
 *  - ScreenshotAIProvider: OCR por IA com visão (v1)
 *  - EconomicCalendarAPIProvider: API estruturada (futuro) — preferida quando configurada
 */
import type { AIImage } from "@/lib/ai/service";
import { generateStructured } from "@/lib/ai/service";
import { OCR_ECONOMIC_CALENDAR } from "@/lib/ai/prompts";
import type { CalendarExtraction } from "@/lib/ai/schemas";
import { G8, type AnyCurrency, type EconomicEventInput } from "@/lib/ai/types";

export interface ExtractionResult {
  events: EconomicEventInput[];
  raw: CalendarExtraction;
  meta: { provider: string; model: string; promptVersion: string; latencyMs: number; overallConfidence: number; ignoredRows: number };
}

export interface EconomicDataProvider {
  readonly name: string;
  extract(input: { images?: AIImage[]; timezone?: string; referenceDate?: string; allowedCurrencies?: readonly AnyCurrency[] }): Promise<ExtractionResult>;
}

export class ScreenshotAIProvider implements EconomicDataProvider {
  readonly name = "screenshot_ai";
  async extract(input: { images?: AIImage[]; timezone?: string; referenceDate?: string; allowedCurrencies?: readonly AnyCurrency[] }): Promise<ExtractionResult> {
    if (!input.images?.length) throw new Error("ScreenshotAIProvider requer ao menos uma imagem");
    const allowed = (input.allowedCurrencies ?? G8) as readonly string[];
    const res = await generateStructured({
      purpose: "macro_extract", prompt: OCR_ECONOMIC_CALENDAR, schemaName: "calendar_extraction", images: input.images, temperature: 0,
      user: `Fuso esperado do screenshot: ${input.timezone ?? "America/Sao_Paulo (GMT-3)"}. Data de referência: ${input.referenceDate ?? new Date().toISOString().slice(0, 10)}. Extraia TODAS as linhas visíveis de todas as imagens, sem duplicar.`,
    });
    const rows = res.data.rows;
    const events: EconomicEventInput[] = [];
    let ignored = 0;
    for (const r of rows) {
      if (!allowed.includes(r.currency)) { ignored++; continue; }
      const actual = r.status === "released" ? r.actual : null; // nunca tratar pendente como realizado
      events.push({
        date: r.date ?? input.referenceDate ?? null, time: r.time, currency: r.currency as AnyCurrency, event: r.event, impact: r.impact,
        actual, forecast: r.forecast, previous: r.previous, source: "screenshot_ai",
        ocr_confidence: r.ocr_confidence, requires_manual_confirmation: r.requires_manual_confirmation || r.ocr_confidence < 0.7 || (r.status === "released" && !actual),
      });
    }
    return { events, raw: res.data, meta: { provider: res.provider, model: res.model, promptVersion: res.promptVersion, latencyMs: res.latencyMs, overallConfidence: res.data.overall_ocr_confidence, ignoredRows: ignored } };
  }
}

/** Placeholder para integração futura (ex.: feed JSON semanal do Forex Factory, API paga, etc.). */
export class EconomicCalendarAPIProvider implements EconomicDataProvider {
  readonly name = "calendar_api";
  constructor(private readonly endpoint?: string) {}
  async extract(): Promise<ExtractionResult> {
    if (!this.endpoint) throw new Error("EconomicCalendarAPIProvider não configurado (defina ECONOMIC_CALENDAR_API_URL).");
    throw new Error("EconomicCalendarAPIProvider ainda não implementado — use ScreenshotAIProvider.");
  }
}

export function getEconomicDataProvider(kind: "screenshot_ai" | "calendar_api" = "screenshot_ai"): EconomicDataProvider {
  return kind === "calendar_api" ? new EconomicCalendarAPIProvider(process.env.ECONOMIC_CALENDAR_API_URL) : new ScreenshotAIProvider();
}
