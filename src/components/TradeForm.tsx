"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, ImagePlus, X, AlertCircle } from "lucide-react";
import { Trade, Config } from "@/lib/types";
import { useConfig, useTrades } from "@/hooks/useTradeData";
import { calculateMetrics } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils";
import NumberInput from "@/components/NumberInput";

const ASSETS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "XAUUSD", "NAS100", "US30", "BTCUSD"];
const SETUPS = ["FVG + OB", "FVG", "Order Block", "Breaker", "Liquidez", "Outro"];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

const STRUCTURE_FIELDS: { key: keyof Trade; label: string }[] = [
  { key: "trendConfirmation" as keyof Trade, label: "Estrutura HTF definida" },
  { key: "displacement" as keyof Trade, label: "Deslocamento confirmado" },
  { key: "bos" as keyof Trade, label: "BOS" },
  { key: "choch" as keyof Trade, label: "CHoCH" },
  { key: "sweepLiquidity" as keyof Trade, label: "Sweep de liquidez" },
];

const SMC_FIELDS: { key: keyof Trade; label: string }[] = [
  { key: "fvg" as keyof Trade, label: "FVG" },
  { key: "orderBlock" as keyof Trade, label: "Order Block" },
  { key: "breaker" as keyof Trade, label: "Breaker" },
];

const CONTEXT_FIELDS: { key: keyof Trade; label: string }[] = [
  { key: "amd" as keyof Trade, label: "AMD" },
];

const DISCIPLINE_FIELDS: { key: keyof Trade; label: string }[] = [
  { key: "earlyEntry", label: "Entrada Antecipada" },
  { key: "earlyExit", label: "Saída Antecipada" },
  { key: "revengeTrade", label: "Revenge Trade" },
  { key: "fomo", label: "FOMO" },
  { key: "overtrading", label: "Overtrading" },
];

export interface TradeFormValues {
  date: string;
  time: string;
  asset: string;
  direction: "BUY" | "SELL";
  session: string;
  timeframeEntry: string;
  timeframeContext: string;
  setup: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  positionSize: string;
  accountBalanceAtTrade: string;
  riskPercent: string;
  riskAmount: string;
  resultAmount: string;
  resultType: "WIN" | "LOSS" | "BREAK EVEN";
  htfBias: string;
  ltfBias: string;
  liquidityType: string;
  liquiditySwept: string;
  premiumDiscount: string;
  macroEvent: string;
  macroCurrency: string;
  macroImpact: string;
  macroBias: string;
  followedPlan: boolean;
  emotionalBefore: string;
  emotionalAfter: string;
  mistakes: string;
  whatWentRight: string;
  whatWentWrong: string;
  lesson: string;
  notes: string;
  screenshotUrl: string;
  [key: string]: unknown;
}

function tradeToFormValues(t: Trade | null, suggestedBalance: number, defaultRiskPercent: number): TradeFormValues {
  const now = new Date();
  return {
    date: t ? new Date(t.date).toISOString().split("T")[0] : now.toISOString().split("T")[0],
    time: t?.time || now.toTimeString().slice(0, 5),
    asset: t?.asset || "EURUSD",
    direction: t?.direction || "BUY",
    session: t?.session || "Nova York",
    timeframeEntry: t?.timeframeEntry || "15m",
    timeframeContext: t?.timeframeContext || "1H",
    setup: t?.setup || "FVG + OB",
    entryPrice: t?.entryPrice != null ? String(t.entryPrice) : "",
    stopLoss: t?.stopLoss != null ? String(t.stopLoss) : "",
    takeProfit: t?.takeProfit != null ? String(t.takeProfit) : "",
    positionSize: t?.positionSize != null ? String(t.positionSize) : "1",
    accountBalanceAtTrade: t?.accountBalanceAtTrade != null ? String(t.accountBalanceAtTrade) : String(suggestedBalance),
    riskPercent: t?.riskPercent != null ? String(t.riskPercent) : String(defaultRiskPercent),
    riskAmount: t?.riskAmount != null ? String(t.riskAmount) : "",
    resultAmount: t?.resultAmount != null ? String(t.resultAmount) : "0",
    resultType: t?.resultType || "WIN",
    htfBias: t?.htfBias || "Bullish",
    ltfBias: t?.ltfBias || "Bullish",
    liquidityType: t?.liquidityType || "",
    liquiditySwept: t?.liquiditySwept || "Sim",
    premiumDiscount: t?.premiumDiscount || "Discount",
    macroEvent: t?.macroEvent || "",
    macroCurrency: t?.macroCurrency || "",
    macroImpact: t?.macroImpact || "Baixo",
    macroBias: t?.macroBias || "Neutro",
    followedPlan: t?.followedPlan ?? true,
    emotionalBefore: t?.emotionalBefore || "Confiante",
    emotionalAfter: t?.emotionalAfter || "Satisfeito",
    mistakes: t?.mistakes || "",
    whatWentRight: t?.whatWentRight || "",
    whatWentWrong: t?.whatWentWrong || "",
    lesson: t?.lesson || "",
    notes: t?.notes || "",
    screenshotUrl: t?.screenshotUrl || "",
    bos: t?.bos ?? false,
    choch: t?.choch ?? false,
    fvg: t?.fvg ?? false,
    orderBlock: t?.orderBlock ?? false,
    breaker: t?.breaker ?? false,
    sweepLiquidity: t?.sweepLiquidity ?? false,
    displacement: t?.displacement ?? false,
    trendConfirmation: t?.trendConfirmation ?? false,
    amd: t?.amd ?? false,
    earlyEntry: t?.earlyEntry ?? false,
    earlyExit: t?.earlyExit ?? false,
    revengeTrade: t?.revengeTrade ?? false,
    fomo: t?.fomo ?? false,
    overtrading: t?.overtrading ?? false,
  };
}

export default function TradeForm({ trade }: { trade?: Trade }) {
  const router = useRouter();
  const { config } = useConfig();
  const { trades } = useTrades();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const suggestedBalance = useMemo(() => {
    if (!config) return 10000;
    const metrics = calculateMetrics(trades.filter((t) => t.id !== trade?.id), config.initialCapital);
    return metrics.currentCapital;
  }, [trades, config, trade]);

  const [form, setForm] = useState<TradeFormValues>(() => tradeToFormValues(trade || null, 10000, 2.5));

  useEffect(() => {
    if (!trade && config) {
      setForm((prev) => ({ ...prev, accountBalanceAtTrade: String(suggestedBalance), riskPercent: String(config.riskPercent) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, suggestedBalance]);

  const steps = ["Dados Básicos", "Gestão de Risco", "Contexto SMC", "Macro & Checklist", "Resultado & Diário"];

  const update = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Live computed preview
  const preview = useMemo(() => {
    const entry = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    const tp = parseFloat(form.takeProfit);
    const balance = parseFloat(form.accountBalanceAtTrade);
    const riskPercent = parseFloat(form.riskPercent);
    const resultAmount = parseFloat(form.resultAmount) || 0;

    let riskAmount = parseFloat(form.riskAmount) || null;
    if (!riskAmount && balance && riskPercent) riskAmount = (riskPercent / 100) * balance;

    let plannedRR: number | null = null;
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp)) {
      const stopDist = Math.abs(entry - sl);
      const tpDist = Math.abs(tp - entry);
      if (stopDist > 0) plannedRR = tpDist / stopDist;
    }

    let resultR: number | null = null;
    if (riskAmount && riskAmount > 0) resultR = resultAmount / riskAmount;

    return { riskAmount, plannedRR, resultR };
  }, [form]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setFormError("A imagem deve ter no máximo 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("screenshotUrl", reader.result as string);
    reader.readAsDataURL(file);
  };

  const validate = (): string | null => {
    if (!form.date) return "Data é obrigatória.";
    if (!form.asset) return "Ativo é obrigatório.";
    if (!form.entryPrice) return "Entrada é obrigatória.";
    if (!form.stopLoss) return "Stop Loss é obrigatório.";
    if (form.resultAmount === "" || form.resultAmount === undefined) return "Resultado é obrigatório.";
    const riskAmount = parseFloat(form.riskAmount) || preview.riskAmount;
    if (riskAmount != null && riskAmount < 0) return "Risco não pode ser negativo.";
    const entry = parseFloat(form.entryPrice);
    const sl = parseFloat(form.stopLoss);
    const tp = parseFloat(form.takeProfit);
    if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp)) {
      if (form.direction === "BUY" && !(sl < entry && tp > entry)) {
        return "Para operações BUY, o Stop Loss deve ser menor e o Take Profit maior que a entrada.";
      }
      if (form.direction === "SELL" && !(sl > entry && tp < entry)) {
        return "Para operações SELL, o Stop Loss deve ser maior e o Take Profit menor que a entrada.";
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSubmitting(true);

    const payload = {
      date: form.date,
      time: form.time,
      asset: form.asset,
      direction: form.direction,
      session: form.session,
      timeframeEntry: form.timeframeEntry,
      timeframeContext: form.timeframeContext,
      setup: form.setup,
      entryPrice: form.entryPrice ? parseFloat(form.entryPrice) : null,
      stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
      takeProfit: form.takeProfit ? parseFloat(form.takeProfit) : null,
      positionSize: form.positionSize ? parseFloat(form.positionSize) : null,
      accountBalanceAtTrade: form.accountBalanceAtTrade ? parseFloat(form.accountBalanceAtTrade) : null,
      riskPercent: form.riskPercent ? parseFloat(form.riskPercent) : null,
      riskAmount: form.riskAmount ? parseFloat(form.riskAmount) : preview.riskAmount,
      resultAmount: parseFloat(form.resultAmount) || 0,
      resultType: form.resultType,
      htfBias: form.htfBias,
      ltfBias: form.ltfBias,
      liquidityType: form.liquidityType,
      liquiditySwept: form.liquiditySwept,
      bos: !!form.bos,
      choch: !!form.choch,
      fvg: !!form.fvg,
      orderBlock: !!form.orderBlock,
      breaker: !!form.breaker,
      sweepLiquidity: !!form.sweepLiquidity,
      displacement: !!form.displacement,
      trendConfirmation: !!form.trendConfirmation,
      amd: !!form.amd,
      premiumDiscount: form.premiumDiscount,
      macroEvent: form.macroEvent,
      macroCurrency: form.macroCurrency,
      macroImpact: form.macroImpact,
      macroBias: form.macroBias,
      followedPlan: !!form.followedPlan,
      earlyEntry: !!form.earlyEntry,
      earlyExit: !!form.earlyExit,
      revengeTrade: !!form.revengeTrade,
      fomo: !!form.fomo,
      overtrading: !!form.overtrading,
      emotionalBefore: form.emotionalBefore,
      emotionalAfter: form.emotionalAfter,
      mistakes: form.mistakes,
      whatWentRight: form.whatWentRight,
      whatWentWrong: form.whatWentWrong,
      lesson: form.lesson,
      notes: form.notes,
      screenshotUrl: form.screenshotUrl || null,
    };

    try {
      const url = trade ? `/api/trades/${trade.id}` : "/api/trades";
      const method = trade ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar operação");
      }
      router.push("/operacoes");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar operação");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass-card-strong p-5 md:p-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(idx + 1)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
              step === idx + 1 ? "bg-emerald/15 text-emerald border border-emerald/20" : "text-slate-muted hover:text-slate-200 border border-white/5 hover:bg-white/[0.03]"
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-extrabold ${step === idx + 1 ? "bg-emerald text-white" : "bg-dark-800 text-slate-400"}`}>
              {idx + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {formError && (
        <div className="mb-5 p-3 rounded-xl bg-rose/10 border border-rose/20 flex items-center gap-2 text-xs text-rose font-medium">
          <AlertCircle size={16} /> {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1 */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField label="Data *" type="date" value={form.date} onChange={(v) => update("date", v)} />
            <FormField label="Horário *" type="time" value={form.time} onChange={(v) => update("time", v)} />
            <FormSelect label="Ativo *" value={form.asset} onChange={(v) => update("asset", v)} options={ASSETS.map((a) => ({ value: a, label: a }))} />
            <FormSelect label="Direção *" value={form.direction} onChange={(v) => update("direction", v)} options={[{ value: "BUY", label: "BUY" }, { value: "SELL", label: "SELL" }]} />
            <FormSelect label="Sessão" value={form.session} onChange={(v) => update("session", v)} options={["Ásia", "Londres", "Nova York", "Outro"].map((s) => ({ value: s, label: s }))} />
            <FormSelect label="Timeframe Entrada" value={form.timeframeEntry} onChange={(v) => update("timeframeEntry", v)} options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} />
            <FormSelect label="Timeframe Contexto" value={form.timeframeContext} onChange={(v) => update("timeframeContext", v)} options={TIMEFRAMES.map((t) => ({ value: t, label: t }))} />
            <FormSelect label="Setup" value={form.setup} onChange={(v) => update("setup", v)} options={SETUPS.map((s) => ({ value: s, label: s }))} />
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <FormField label="Saldo da Conta ($)" type="number" step="0.01" value={form.accountBalanceAtTrade} onChange={(v) => update("accountBalanceAtTrade", v)} />
              <FormField label="Risco (%)" type="number" step="0.1" value={form.riskPercent} onChange={(v) => update("riskPercent", v)} />
              <FormField label="Risco ($) — opcional" type="number" step="0.01" value={form.riskAmount} onChange={(v) => update("riskAmount", v)} placeholder="Calculado automaticamente" />
              <FormField label="Tamanho Posição" type="number" step="0.01" value={form.positionSize} onChange={(v) => update("positionSize", v)} />
              <FormField label="Entrada (preço) *" type="number" step="0.00001" value={form.entryPrice} onChange={(v) => update("entryPrice", v)} />
              <FormField label="Stop Loss *" type="number" step="0.00001" value={form.stopLoss} onChange={(v) => update("stopLoss", v)} />
              <FormField label="Take Profit" type="number" step="0.00001" value={form.takeProfit} onChange={(v) => update("takeProfit", v)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <PreviewStat label="Risco Calculado" value={preview.riskAmount != null ? formatCurrency(preview.riskAmount) : "—"} />
              <PreviewStat label="R:R Planejado" value={preview.plannedRR != null ? `${preview.plannedRR.toFixed(2)}` : "—"} />
              <PreviewStat label="R Estimado do Resultado" value={preview.resultR != null ? `${preview.resultR >= 0 ? "+" : ""}${preview.resultR.toFixed(2)}R` : "—"} />
            </div>
          </div>
        )}

        {/* Step 3 - SMC */}
        {step === 3 && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <FormSelect label="HTF Bias" value={form.htfBias} onChange={(v) => update("htfBias", v)} options={["Bullish", "Bearish", "Neutro"].map((s) => ({ value: s, label: s }))} />
              <FormSelect label="LTF Bias" value={form.ltfBias} onChange={(v) => update("ltfBias", v)} options={["Bullish", "Bearish", "Neutro"].map((s) => ({ value: s, label: s }))} />
              <FormSelect label="Premium / Discount" value={form.premiumDiscount} onChange={(v) => update("premiumDiscount", v)} options={["Premium", "Discount", "Equilibrium"].map((s) => ({ value: s, label: s }))} />
              <FormField label="Tipo de Liquidez" value={form.liquidityType} onChange={(v) => update("liquidityType", v)} placeholder="Ex: Fundo da Ásia" />
              <FormSelect label="Londres capturou liquidez?" value={form.liquiditySwept} onChange={(v) => update("liquiditySwept", v)} options={["Sim", "Não", "Parcial"].map((s) => ({ value: s, label: s }))} />
            </div>

            <h3 className="text-sm font-bold text-white mb-3">Estrutura</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {STRUCTURE_FIELDS.map((item) => (
                <CheckboxField key={item.key} label={item.label} checked={!!form[item.key as string]} onChange={(v) => update(item.key as string, v)} />
              ))}
            </div>

            <h3 className="text-sm font-bold text-white mb-3">SMC</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
              {SMC_FIELDS.map((item) => (
                <CheckboxField key={item.key} label={item.label} checked={!!form[item.key as string]} onChange={(v) => update(item.key as string, v)} />
              ))}
            </div>

            <h3 className="text-sm font-bold text-white mb-3">Contexto</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {CONTEXT_FIELDS.map((item) => (
                <CheckboxField key={item.key} label={item.label} checked={!!form[item.key as string]} onChange={(v) => update(item.key as string, v)} />
              ))}
            </div>
          </div>
        )}

        {/* Step 4 - Macro & Discipline */}
        {step === 4 && (
          <div>
            <h3 className="text-sm font-bold text-white mb-3">Macroeconomia</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <FormSelect label="Evento" value={form.macroEvent} onChange={(v) => update("macroEvent", v)} options={["", "CPI", "NFP", "FOMC", "PCE", "GDP", "PMI", "Retail Sales", "Interest Rate", "Unemployment", "Outros"].map((s) => ({ value: s, label: s || "Nenhum" }))} />
              <FormField label="Moeda Afetada" value={form.macroCurrency} onChange={(v) => update("macroCurrency", v)} placeholder="USD" />
              <FormSelect label="Impacto" value={form.macroImpact} onChange={(v) => update("macroImpact", v)} options={["Baixo", "Médio", "Alto"].map((s) => ({ value: s, label: s }))} />
              <FormSelect label="Viés Macro" value={form.macroBias} onChange={(v) => update("macroBias", v)} options={["Bullish", "Bearish", "Neutro"].map((s) => ({ value: s, label: s }))} />
            </div>

            <h3 className="text-sm font-bold text-white mb-3">Disciplina</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              <CheckboxField label="Segui o Plano" checked={!!form.followedPlan} onChange={(v) => update("followedPlan", v)} />
              {DISCIPLINE_FIELDS.map((item) => (
                <CheckboxField key={item.key} label={item.label} checked={!!form[item.key]} onChange={(v) => update(item.key, v)} />
              ))}
            </div>

            <h3 className="text-sm font-bold text-white mb-3">Estado Emocional</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormSelect label="Antes da operação" value={form.emotionalBefore} onChange={(v) => update("emotionalBefore", v)} options={["Confiante", "Neutro", "Ansioso", "Com medo", "Eufórico", "Frustrado"].map((s) => ({ value: s, label: s }))} />
              <FormSelect label="Depois da operação" value={form.emotionalAfter} onChange={(v) => update("emotionalAfter", v)} options={["Satisfeito", "Neutro", "Frustrado", "Ansioso", "Eufórico"].map((s) => ({ value: s, label: s }))} />
            </div>
          </div>
        )}

        {/* Step 5 - Result & Journal */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormSelect label="Resultado Final *" value={form.resultType} onChange={(v) => update("resultType", v)} options={[{ value: "WIN", label: "WIN" }, { value: "LOSS", label: "LOSS" }, { value: "BREAK EVEN", label: "BREAK EVEN" }]} />
              <FormField label="Resultado ($) *" type="number" step="0.01" value={form.resultAmount} onChange={(v) => update("resultAmount", v)} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-muted uppercase tracking-wider font-semibold">Resultado (R) — estimado</label>
                <div className="w-full bg-dark-900 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-slate-300">
                  {preview.resultR != null ? `${preview.resultR >= 0 ? "+" : ""}${preview.resultR.toFixed(2)}R` : "—"}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-muted uppercase tracking-wider font-semibold block mb-1.5">Screenshot da Operação</label>
              {form.screenshotUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.screenshotUrl} alt="Screenshot" className="max-h-48 rounded-xl border border-white/10" />
                  <button type="button" onClick={() => update("screenshotUrl", "")} className="absolute -top-2 -right-2 bg-rose text-white rounded-full p-1"><X size={14} /></button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/10 text-slate-muted text-xs cursor-pointer hover:border-emerald/30 hover:text-emerald transition w-fit">
                  <ImagePlus size={16} /> Adicionar imagem
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <textarea placeholder="O que eu fiz certo?" value={form.whatWentRight} onChange={(e) => update("whatWentRight", e.target.value)} rows={3} className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition resize-none" />
              <textarea placeholder="O que eu fiz errado?" value={form.whatWentWrong} onChange={(e) => update("whatWentWrong", e.target.value)} rows={3} className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition resize-none" />
              <textarea placeholder="O que devo repetir?" value={form.lesson} onChange={(e) => update("lesson", e.target.value)} rows={3} className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition resize-none" />
              <textarea placeholder="Erros cometidos" value={form.mistakes} onChange={(e) => update("mistakes", e.target.value)} rows={3} className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition resize-none" />
            </div>
            <textarea placeholder="Observações e notas adicionais" value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={2} className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition resize-none" />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-6 border-t border-white/5">
          <button
            type="button"
            onClick={() => setStep(Math.max(1, step - 1))}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition ${step === 1 ? "invisible" : "bg-dark-800 text-white hover:bg-dark-700 border border-white/5"}`}
          >
            Voltar
          </button>
          {step < steps.length ? (
            <button
              type="button"
              onClick={() => setStep(Math.min(steps.length, step + 1))}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald to-emerald-bright text-white text-sm font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)] transition active:scale-[0.98]"
            >
              Próximo
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald to-emerald-bright hover:from-emerald-bright hover:to-emerald text-white text-sm font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.25)] transition active:scale-[0.98] disabled:opacity-60"
            >
              <Save size={16} />
              {submitting ? "Salvando..." : trade ? "Atualizar Operação" : "Salvar Operação"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function FormField({ label, type = "text", value, onChange, step, placeholder }: { label: string; type?: string; value: string | number; onChange: (v: string) => void; step?: string; placeholder?: string }) {
  const base = "w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald/30 transition";
  if (type === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] text-slate-muted uppercase tracking-wider font-semibold">{label}</label>
        <NumberInput value={value} onChange={(v) => onChange(String(v))} className={base} placeholder={placeholder} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-slate-muted uppercase tracking-wider font-semibold">{label}</label>
      <input
        type={type}
        step={step}
        value={String(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-slate-muted uppercase tracking-wider font-semibold">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald/30 transition appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition text-xs text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-emerald rounded border-white/10 bg-dark-800" />
      <span>{label}</span>
    </label>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-slate-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-emerald mt-0.5">{value}</p>
    </div>
  );
}
