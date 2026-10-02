/** POST multipart: images[] + labels (JSON de timeframes) + symbol + session + macroBias + candidateId → análise SMC/ICT + checklist. */
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { technicalAnalyses, tradeCandidates, intermarketSnapshots } from "@/db/schema";
import { authorize, errorResponse, json, readImages } from "@/lib/api-utils";
import { ensureAIAudit } from "@/lib/ai/audit";
import { generateStructured } from "@/lib/ai/service";
import { TECHNICAL_SMC_ICT } from "@/lib/ai/prompts";
import { TIMEFRAMES, type Currency } from "@/lib/ai/types";
import { buildChecklist } from "@/lib/smc/checklist";
import { loadPendingEvents } from "@/lib/macro/pipeline";
import { eventRiskFor } from "@/lib/macro/event-risk";
import { splitSymbol } from "@/lib/macro/pairs";
import { loadOpenExposure } from "@/lib/journal/service";
import { wouldIncreaseConcentration } from "@/lib/macro/exposure";

export const dynamic = "force-dynamic";
const INTERMARKET_SYMBOLS = /^(XAU|GOLD|NAS|US100|USTEC|NDX|BTC)/i;

export async function POST(request: Request) {
  const unauthorized = authorize(request); if (unauthorized) return unauthorized;
  try {
    ensureAIAudit();
    const form = await request.formData();
    const images = await readImages(form, "images", "labels");
    const symbol = String(form.get("symbol") ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 16);
    if (!symbol) return json({ error: "symbol obrigatório" }, 400);
    const session = (form.get("session") as string) || null;
    const macroBiasRaw = (form.get("macroBias") as string) || "";
    const macroBias = (["LONG", "SHORT", "NEUTRAL"].includes(macroBiasRaw) ? macroBiasRaw : null) as "LONG" | "SHORT" | "NEUTRAL" | null;
    const macroDivergence = form.get("macroDivergence") ? Number(form.get("macroDivergence")) : null;
    const candidateId = form.get("candidateId") ? Number(form.get("candidateId")) : null;
    for (const img of images) if (!img.label || !(TIMEFRAMES as readonly string[]).includes(img.label)) return json({ error: `Cada imagem precisa de um timeframe válido (${TIMEFRAMES.join(", ")})` }, 400);

    // contexto: event risk das pernas + intermarket (XAU/NAS/BTC) + exposição
    const parts = splitSymbol(symbol);
    const pending = await loadPendingEvents(new Date(), 12).catch(() => []);
    const legs = parts ? ([parts.base, parts.quote] as Currency[]) : (["USD"] as Currency[]);
    const risk = eventRiskFor(legs, pending, { horizonHours: 4 });
    let intermarket: Record<string, unknown> | null = null;
    if (INTERMARKET_SYMBOLS.test(symbol)) {
      const im = await getDb().select().from(intermarketSnapshots).orderBy(desc(intermarketSnapshots.capturedAt)).limit(1).catch(() => []);
      if (im[0]) intermarket = { dxy: im[0].dxy, us02y: im[0].us02y, us10y: im[0].us10y, real_yield: im[0].realYield, regime: im[0].regime, captured_at: im[0].capturedAt };
    }
    const exposure = await loadOpenExposure().catch(() => null);

    const order = TIMEFRAMES as readonly string[];
    const sorted = [...images].sort((a, b) => order.indexOf(a.label!) - order.indexOf(b.label!));
    const res = await generateStructured({
      purpose: "technical_analysis", prompt: TECHNICAL_SMC_ICT, schemaName: "technical_analysis", temperature: 0.2, maxOutputTokens: 7000,
      images: sorted.map((i) => ({ base64: i.base64, mime: i.mime, label: i.label })),
      user: `Ativo: ${symbol}. Sessão: ${session ?? "n/a"}. Macro: ${macroBias ?? "não informado"}${macroDivergence ? ` (divergência ${macroDivergence})` : ""}. Event risk próximas 4h: ${risk.level}${risk.events.length ? ` (${risk.events.map((e) => `${e.currency} ${e.event} em ${e.minutes_until}min`).join("; ")})` : ""}. Imagens rotuladas na ordem: ${sorted.map((i) => i.label).join(", ")}. Intermarket: ${intermarket ? JSON.stringify(intermarket) : "null"}.`,
    });
    const analysis = res.data;
    let correlationOk: boolean | null = null;
    if (exposure && analysis.suggested_direction !== "NONE") correlationOk = wouldIncreaseConcentration(exposure, symbol, analysis.suggested_direction).ok;
    const checklist = buildChecklist(analysis, { macroBias, macroDivergence, eventRisk: risk.level, correlationOk });

    const [row] = await getDb().insert(technicalAnalyses).values({
      symbol, session, candidateId, macroBias, macroDivergence, timeframes: sorted.map((i) => i.label), images: sorted.map((i) => ({ timeframe: i.label, name: i.name, size: i.size })),
      resultJson: analysis, checklistJson: checklist, htfBias: analysis.htf_bias, liquiditySweep: analysis.liquidity_sweep, displacement: analysis.displacement,
      mssPresent: analysis.mss.present, mssTimeframe: analysis.mss.timeframe, mssType: analysis.mss.type, entryModelAi: analysis.entry_model, entryModelFinal: checklist.entry_model,
      setupGradeAi: analysis.setup_grade, setupGradeFinal: checklist.setup_grade, status: checklist.status, eventRisk: risk.level, model: res.model, promptVersion: res.promptVersion,
    }).returning({ id: technicalAnalyses.id });
    if (candidateId) await getDb().select().from(tradeCandidates).where(eq(tradeCandidates.id, candidateId)).limit(1).catch(() => null);

    return json({ id: row.id, analysis, checklist, event_risk: risk, intermarket, meta: { provider: res.provider, model: res.model, prompt_version: res.promptVersion, latency_ms: res.latencyMs } });
  } catch (e) { return errorResponse(e, "Falha na análise técnica"); }
}
