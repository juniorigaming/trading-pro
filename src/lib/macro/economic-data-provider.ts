/**
 * EconomicDataProvider — origem dos dados do calendário.
 * Fluxo do screenshot (AI = extração; CÓDIGO = validação):
 *   imagem → IA transcreve (JSON + raw_row_text) → código valida (moeda/evento/valores no texto da linha)
 *          → IA confere cada linha contra a imagem (verificação visual) → código aceita só o confirmado.
 * O restante do sistema só conhece EconomicEventInput[].
 */
import type { AIImage } from "@/lib/ai/service";
import { AIError, generateStructured, resolveProvider } from "@/lib/ai/service";
import { OCR_ECONOMIC_CALENDAR, OCR_VISIBILITY_CHECK } from "@/lib/ai/prompts";
import type { CalendarExtraction } from "@/lib/ai/schemas";
import { G8, type AnalysisAudit, type AnyCurrency, type EconomicEventInput } from "@/lib/ai/types";
import { validateExtractedRows, type RawExtractedRow } from "./extraction-validation";

export type ExtractionAudit = NonNullable<AnalysisAudit["extraction"]>;

export interface ExtractionResult {
  events: EconomicEventInput[];
  raw: CalendarExtraction;
  meta: { provider: string; model: string; promptVersion: string; latencyMs: number; overallConfidence: number; ignoredRows: number; rejectedRows: number; discardedValues: number; visualVerification: ExtractionAudit["visual_verification"]; notes: string[] };
  audit: ExtractionAudit;
}

export interface EconomicDataProvider {
  readonly name: string;
  extract(input: { images?: AIImage[]; timezone?: string; referenceDate?: string; allowedCurrencies?: readonly AnyCurrency[] }): Promise<ExtractionResult>;
}

export class ScreenshotAIProvider implements EconomicDataProvider {
  readonly name = "screenshot_ai";
  async extract(input: { images?: AIImage[]; timezone?: string; referenceDate?: string; allowedCurrencies?: readonly AnyCurrency[] }): Promise<ExtractionResult> {
    if (!input.images?.length) throw new Error("ScreenshotAIProvider requer ao menos uma imagem");
    // Nunca extrair com o provedor "mock": ele inventa linhas. Sem IA configurada, a análise para aqui.
    const resolved = resolveProvider();
    if (resolved.provider === "mock") {
      throw new AIError(`IA não configurada para leitura de screenshot (${resolved.model}). Defina AI_PROVIDER e a chave correspondente. Nenhum dado foi inventado.`, 503, "AI_NOT_CONFIGURED");
    }
    const allowed = (input.allowedCurrencies ?? G8) as readonly string[];
    const res = await generateStructured({
      purpose: "macro_extract", prompt: OCR_ECONOMIC_CALENDAR, schemaName: "calendar_extraction", images: input.images, temperature: 0,
      user: `Fuso esperado do screenshot: ${input.timezone ?? "America/Sao_Paulo (GMT-3)"}. Data de referência: ${input.referenceDate ?? new Date().toISOString().slice(0, 10)}. Extraia TODAS as linhas visíveis de todas as imagens, sem duplicar. Não interprete.`,
    });
    const notes: string[] = [];

    // 1) Validação determinística (código).
    const v = validateExtractedRows(res.data.rows as RawExtractedRow[], { allowed });
    let accepted = v.accepted;
    const rejected: ExtractionAudit["rejected"] = v.rejected.map((r) => ({ index: r.index, currency: r.currency, event: r.event, reason: r.reason }));

    // 2) Verificação visual (IA confere cada linha contra a imagem). Sem "visible: true" explícito ⇒ não aceita.
    let visual: ExtractionAudit["visual_verification"] = "SKIPPED";
    if (process.env.MACRO_VISUAL_VERIFY !== "0" && accepted.length) {
      try {
        const check = await generateStructured({
          purpose: "macro_verify", prompt: OCR_VISIBILITY_CHECK, schemaName: "calendar_visibility", images: input.images, temperature: 0, timeoutMs: 60_000,
          user: JSON.stringify({ candidates: accepted.map((a) => ({ index: a.index, currency: a.currency, event: a.event, time: a.time, actual: a.actual, forecast: a.forecast, previous: a.previous })) }),
        });
        const verdict = new Map(check.data.verdicts.map((x) => [x.index, x]));
        const keep = [];
        for (const a of accepted) {
          const ver = verdict.get(a.index);
          if (ver?.visible === true) keep.push(a);
          else rejected.push({ index: a.index, currency: a.currency, event: a.event, reason: `não confirmada visualmente no screenshot${ver?.reason ? `: ${ver.reason}` : ""}` });
        }
        visual = rejected.some((r) => r.reason.startsWith("não confirmada")) ? "REJECTED_SOME" : "OK";
        accepted = keep;
      } catch (e) {
        visual = "UNAVAILABLE";
        notes.push(`Verificação visual não concluída (${(e as Error).message.slice(0, 120)}). Eventos NÃO confirmados na imagem — a análise fica insuficiente.`);
      }
    } else if (process.env.MACRO_VISUAL_VERIFY === "0") {
      notes.push("Verificação visual desativada (MACRO_VISUAL_VERIFY=0). Análise marcada como insuficiente.");
    }

    const noDate = accepted.filter((a) => !a.date).length;
    if (noDate) notes.push(`${noDate} evento(s) sem data legível no screenshot — usada a data de referência.`);

    const events: EconomicEventInput[] = accepted.map((a) => ({
      date: a.date ?? input.referenceDate ?? null, time: a.time, currency: a.currency as AnyCurrency, event: a.event, impact: a.impact,
      actual: a.actual, forecast: a.forecast, previous: a.previous, source: "screenshot_ai",
      ocr_confidence: a.ocr_confidence, requires_manual_confirmation: a.requires_manual_confirmation,
    }));

    const audit: ExtractionAudit = {
      provider: res.provider, model: res.model, raw_json: res.data, rows_received: res.data.rows.length,
      accepted: accepted.map((a) => ({ currency: a.currency, event: a.event, time: a.time, actual: a.actual, forecast: a.forecast, previous: a.previous, confidence: a.ocr_confidence, raw_row_text: a.raw_row_text })),
      rejected,
      values_discarded: v.values_discarded.map((d) => ({ currency: d.currency, event: d.event, field: d.field, value: d.value, reason: d.reason })),
      visual_verification: visual,
    };

    return {
      events, raw: res.data,
      meta: { provider: res.provider, model: res.model, promptVersion: res.promptVersion, latencyMs: res.latencyMs, overallConfidence: res.data.overall_ocr_confidence, ignoredRows: v.rejected.filter((r) => r.reason.startsWith("moeda fora do escopo")).length, rejectedRows: rejected.length, discardedValues: v.values_discarded.length, visualVerification: visual, notes },
      audit,
    };
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
