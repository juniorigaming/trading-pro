/**
 * Provedor MOCK — usado em testes e quando não há chave configurada.
 * Retorna respostas determinísticas válidas para cada schema (não gasta tokens).
 */
import type { SchemaName } from "./schemas";

export function mockStructured(schema: SchemaName, user: string): unknown {
  switch (schema) {
    case "calendar_extraction":
      return {
        source_type: "forexfactory", detected_timezone: "GMT-3",
        rows: [
          { date: today(), time: "09:30", currency: "USD", event: "Core CPI m/m", impact: "high", actual: "0.4%", forecast: "0.3%", previous: "0.2%", status: "released", ocr_confidence: 0.96, requires_manual_confirmation: false, ocr_issues: ["none"] },
          { date: today(), time: "21:30", currency: "AUD", event: "Employment Change", impact: "high", actual: null, forecast: "25.0K", previous: "47.5K", status: "pending", ocr_confidence: 0.9, requires_manual_confirmation: false, ocr_issues: ["none"] },
          { date: today(), time: "05:00", currency: "EUR", event: "Flash Services PMI", impact: "medium", actual: "51.2", forecast: "50.6", previous: "50.5", status: "released", ocr_confidence: 0.62, requires_manual_confirmation: true, ocr_issues: ["blurry"] },
        ],
        overall_ocr_confidence: 0.83, notes: ["Resposta MOCK — configure OPENAI_API_KEY para OCR real."],
      };
    case "event_interpretation": {
      const ids = [...user.matchAll(/"id":\s*(\d+)/g)].map((m) => Number(m[1]));
      const ccyByEvent = new Map<number, string>();
      for (const m of user.matchAll(/"id":\s*(\d+)[^}]*?"currency":\s*"([A-Z]{3})"/g)) ccyByEvent.set(Number(m[1]), m[2]);
      const CB: Record<string, string> = { USD: "FED", EUR: "ECB", GBP: "BOE", JPY: "BOJ", CHF: "SNB", CAD: "BOC", AUD: "RBA", NZD: "RBNZ", BRL: "BCB", CNY: "PBOC" };
      return {
        interpretations: ids.map((id, i) => ({
          event_id: id, category: i % 2 === 0 ? "INFLATION" : "GROWTH", subcategory: i % 2 === 0 ? "core_cpi_mom" : "pmi_services_flash",
          importance: i % 2 === 0 ? "HIGH" : "MEDIUM_HIGH", surprise_vs_forecast: "BEAT", change_vs_previous: "HIGHER",
          classification: i % 2 === 0 ? "BULLISH" : "NEUTRAL", growth_implication: "POSITIVE", inflation_implication: i % 2 === 0 ? "HOTTER" : "NEUTRAL",
          central_bank: CB[ccyByEvent.get(id) ?? "USD"] ?? "FED", fiscal_implication: "NA", central_bank_implication: i % 2 === 0 ? "SLIGHTLY_HAWKISH" : "UNCHANGED", priced_in: "PARTIALLY_PRICED",
          currency_implication: i % 2 === 0 ? "POSITIVE" : "NEUTRAL", confidence: "MEDIUM",
          reasoning_summary: "MOCK: dado acima do forecast → leve pressão hawkish → suporte moderado à moeda.",
        })),
      };
    }
    case "market_extraction":
      return {
        source_type: "tradingview",
        rows: [
          { symbol: "DI", contract_code: "DI1F27", label_seen: "DI1F27", value: 14.85, change_pct: null, change_bp: -5, as_of: null, ocr_confidence: 0.9, requires_manual_confirmation: false },
          { symbol: "DXY", contract_code: null, label_seen: "DXY", value: 104.2, change_pct: 0.3, change_bp: null, as_of: null, ocr_confidence: 0.92, requires_manual_confirmation: false },
          { symbol: "IRON_ORE", contract_code: null, label_seen: "Iron Ore 62%", value: null, change_pct: null, change_bp: null, as_of: null, ocr_confidence: 0.3, requires_manual_confirmation: true },
        ],
        overall_ocr_confidence: 0.7, notes: ["Resposta MOCK — configure a chave de IA para OCR real."],
      };
    case "b3_brief":
      return { headline: "MOCK: brief B3 simulado.", regime_narrative: "Resposta simulada.", win_view: "MOCK", dol_view: "MOCK", di_curve_cause: "UNKNOWN", di_curve_comment: "MOCK", candidate_reasons: [], conflicts: [], warnings: ["Provedor MOCK ativo"] };
    case "session_brief":
      return { headline: "MOCK: sessão sem narrativa real (configure a chave de IA).", narrative: "Resposta simulada para desenvolvimento.", candidate_reasons: [], pairs_to_avoid: [], warnings: ["Provedor MOCK ativo"] };
    case "technical_analysis":
      return {
        symbol: (user.match(/Ativo:\s*([A-Z0-9]+)/)?.[1]) ?? "EURUSD", image_quality: "ACCEPTABLE", macro_bias: "UNKNOWN", htf_bias: "UNCLEAR",
        draw_on_liquidity: [], timeframes: [], poi: [],
        location: { htf_premium_discount: "UNCLEAR", poi_reached: false, poi_description: null, is_extended: false },
        liquidity_sweep: false, liquidity_sweep_detail: { timeframe: null, description: null }, rejection: false,
        displacement: false, displacement_detail: { timeframe: null, created_fvg: false, description: null },
        mss: { present: false, type: "NONE", timeframe: null, follow_through: false, broke_what: null },
        retest: { occurred: false, poi_type: "NONE", description: null },
        entry_model: "NONE", setup_grade: "NO_TRADE", status: "WAIT", disqualifiers: ["POOR_IMAGE"], suggested_direction: "NONE",
        wait_for: ["Configure OPENAI_API_KEY para análise real"], invalidation: "n/a", targets: [], risk_recommendation: "NONE",
        management_notes: "MOCK", intermarket_note: null, warnings: ["Provedor MOCK ativo"], confidence: "LOW",
      };
    case "trade_review":
      return { process_grade: "B", process_grade_reasoning: "MOCK", execution_vs_plan: "FOLLOWED", error_tags: [], what_went_right: [], what_went_wrong: [], stop_placement: "UNKNOWN", mae_mfe_comment: "MOCK", management_assessment: "MOCK", lesson: "Configure a chave de IA.", confidence: "LOW" };
  }
}

function today() { return new Date().toISOString().slice(0, 10); }
