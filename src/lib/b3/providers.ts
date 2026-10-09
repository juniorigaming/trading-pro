/**
 * Providers de dados do módulo B3 — a regra de negócio nunca conhece a origem.
 *  - Calendário: reutiliza EconomicDataProvider (ScreenshotAIProvider hoje; BCB/IBGE/API depois).
 *  - Curva DI / mercado / fluxo: MarketDataProvider (ScreenshotMarketProvider hoje; B3/ANBIMA/market data depois).
 *  Stubs tipados para as integrações futuras (BCB SGS, IBGE SIDRA, B3, curva DI, commodities) — lançam erro claro.
 */
import type { AIImage } from "@/lib/ai/service";
import { generateStructured } from "@/lib/ai/service";
import { OCR_MARKET_SNAPSHOT } from "@/lib/ai/prompts";
import type { MarketExtraction } from "@/lib/ai/schemas";
import type { DiContractConfig } from "./config";
import type { DiContractInput } from "./types";

export interface MarketSnapshotInput {
  symbol: string; // MARKET_SYMBOLS ou código DI (DI1F27)
  contract_code?: string | null;
  value: number | null;
  change_pct: number | null;
  change_bp: number | null;
  as_of?: string | null;
  source: "screenshot_ai" | "manual" | "api";
  ocr_confidence?: number | null;
  requires_manual_confirmation?: boolean;
  label_seen?: string;
}

export interface MarketExtractionResult { rows: MarketSnapshotInput[]; raw: MarketExtraction; meta: { provider: string; model: string; promptVersion: string; latencyMs: number; overallConfidence: number } }

export interface MarketDataProvider {
  readonly name: string;
  extract(input: { images?: AIImage[]; diContracts?: DiContractConfig[] }): Promise<MarketExtractionResult>;
}

/** OCR por IA de painéis (TradingView/Profit/MT5/B3) — nunca inventa: null + requires_manual_confirmation. */
export class ScreenshotMarketProvider implements MarketDataProvider {
  readonly name = "screenshot_ai";
  async extract(input: { images?: AIImage[]; diContracts?: DiContractConfig[] }): Promise<MarketExtractionResult> {
    if (!input.images?.length) throw new Error("ScreenshotMarketProvider requer ao menos uma imagem");
    const di = (input.diContracts ?? []).map((c) => `${c.code} (${c.tenor})`).join(", ");
    const res = await generateStructured({
      purpose: "b3_market_extract", prompt: OCR_MARKET_SNAPSHOT, schemaName: "market_extraction", images: input.images, temperature: 0,
      user: `Extraia todas as cotações/taxas legíveis. Contratos DI configurados pelo usuário (priorize-os se aparecerem): ${di || "nenhum"}. Fluxo estrangeiro em R$ milhões com sinal. Não invente valores.`,
    });
    const rows: MarketSnapshotInput[] = res.data.rows.filter((r) => r.symbol !== "OTHER").map((r) => ({
      symbol: r.symbol === "DI" ? (r.contract_code ?? "DI").toUpperCase() : r.symbol, contract_code: r.contract_code, value: r.value, change_pct: r.change_pct, change_bp: r.change_bp, as_of: r.as_of,
      source: "screenshot_ai", ocr_confidence: r.ocr_confidence, requires_manual_confirmation: r.requires_manual_confirmation || r.ocr_confidence < 0.7 || (r.value === null && r.change_pct === null && r.change_bp === null), label_seen: r.label_seen,
    }));
    return { rows, raw: res.data, meta: { provider: res.provider, model: res.model, promptVersion: res.promptVersion, latencyMs: res.latencyMs, overallConfidence: res.data.overall_ocr_confidence } };
  }
}

/** Futuro: B3/ANBIMA (curva DI), market data (índices/commodities), BCB SGS (Selic/Focus), IBGE SIDRA (IPCA/PIB). */
export class MarketDataAPIProvider implements MarketDataProvider {
  readonly name = "market_api";
  constructor(private readonly endpoint?: string) {}
  async extract(): Promise<MarketExtractionResult> {
    if (!this.endpoint) throw new Error("MarketDataAPIProvider não configurado (defina B3_MARKET_API_URL).");
    throw new Error("MarketDataAPIProvider ainda não implementado — use screenshots ou entrada manual.");
  }
}
export interface BrazilMacroAPIProvider { readonly name: "bcb_sgs" | "ibge_sidra" | "b3_flow"; fetchLatest(series: string): Promise<{ date: string; value: number } | null> }
export class BcbSgsProvider implements BrazilMacroAPIProvider {
  readonly name = "bcb_sgs" as const;
  async fetchLatest(): Promise<null> { throw new Error("BcbSgsProvider ainda não implementado (planejado: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{id})."); }
}

export function getMarketDataProvider(kind: "screenshot_ai" | "market_api" = "screenshot_ai"): MarketDataProvider {
  return kind === "market_api" ? new MarketDataAPIProvider(process.env.B3_MARKET_API_URL) : new ScreenshotMarketProvider();
}

/** Separa linhas de DI (por código configurado) das demais, montando DiContractInput[]. */
export function splitDiRows(rows: MarketSnapshotInput[], contracts: DiContractConfig[]): { di: DiContractInput[]; others: MarketSnapshotInput[] } {
  const di: DiContractInput[] = [];
  const others: MarketSnapshotInput[] = [];
  for (const r of rows) {
    const code = (r.contract_code ?? r.symbol).toUpperCase();
    const cfg = contracts.find((c) => c.code.toUpperCase() === code);
    if (cfg) di.push({ code: cfg.code, tenor: cfg.tenor, rate: r.value, change_bp: r.change_bp });
    else if (/^DI1[FGHJKMNQUVXZ]\d{2}$/.test(code)) di.push({ code, tenor: "MID", rate: r.value, change_bp: r.change_bp }); // DI não configurado: entra como MID até o usuário classificar
    else others.push(r);
  }
  return { di, others };
}
