"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { Trade } from "@/lib/types";
import { formatCurrency, formatR } from "@/lib/utils";

const SMC_TAGS: { key: keyof Trade; label: string }[] = [
  { key: "trendConfirmation", label: "Estrutura HTF definida" },
  { key: "displacement", label: "Deslocamento" },
  { key: "bos", label: "BOS" },
  { key: "choch", label: "CHoCH" },
  { key: "sweepLiquidity", label: "Sweep de Liquidez" },
  { key: "fvg", label: "FVG" },
  { key: "orderBlock", label: "Order Block" },
  { key: "breaker", label: "Breaker" },
  { key: "amd", label: "AMD" },
];

export default function OperacaoDetalhePage() {
  const params = useParams();
  const id = params.id as string;
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trades/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Operação não encontrada");
        return res.json();
      })
      .then(setTrade)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-muted text-sm">Carregando...</div>;
  if (error || !trade) return <div className="p-8 text-center text-rose text-sm">{error || "Operação não encontrada"}</div>;

  const activeTags = SMC_TAGS.filter((tag) => trade[tag.key]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href="/operacoes" className="inline-flex items-center gap-1 text-xs text-slate-muted hover:text-white transition"><ArrowLeft size={14} /> Voltar</Link>
        <Link href={`/operacoes/${trade.id}/editar`} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber hover:underline"><Pencil size={13} /> Editar</Link>
      </div>
      <h1 className="text-2xl font-extrabold text-white mb-1">Detalhes da Operação #{trade.id} {trade.isDemo && <span className="text-xs text-sky font-medium ml-2">(Demonstração)</span>}</h1>
      <p className="text-sm text-slate-muted mb-6">{trade.asset} · {new Date(trade.date).toLocaleDateString("pt-BR")} às {trade.time}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-3">Dados Básicos</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-muted">Data:</span> <span className="text-white font-medium">{new Date(trade.date).toLocaleDateString("pt-BR")}</span></p>
            <p><span className="text-slate-muted">Hora:</span> <span className="text-white font-medium">{trade.time}</span></p>
            <p><span className="text-slate-muted">Ativo:</span> <span className="text-white font-bold">{trade.asset}</span></p>
            <p><span className="text-slate-muted">Direção:</span> <span className={`font-bold ${trade.direction === "BUY" ? "text-emerald" : "text-rose"}`}>{trade.direction}</span></p>
            <p><span className="text-slate-muted">Sessão:</span> <span className="text-white font-medium">{trade.session}</span></p>
            <p><span className="text-slate-muted">Setup:</span> <span className="text-white font-medium">{trade.setup || "—"}</span></p>
            <p><span className="text-slate-muted">Timeframe:</span> <span className="text-white font-medium">{trade.timeframeEntry || "—"} / {trade.timeframeContext || "—"}</span></p>
          </div>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-3">Gestão de Risco</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-muted">Entrada:</span> <span className="text-white font-medium">{trade.entryPrice ?? "—"}</span></p>
            <p><span className="text-slate-muted">Stop Loss:</span> <span className="text-rose font-medium">{trade.stopLoss ?? "—"}</span></p>
            <p><span className="text-slate-muted">Take Profit:</span> <span className="text-emerald font-medium">{trade.takeProfit ?? "—"}</span></p>
            <p><span className="text-slate-muted">Risco:</span> <span className="text-white font-medium">{trade.riskAmount != null ? formatCurrency(trade.riskAmount) : "—"}</span></p>
            <p><span className="text-slate-muted">R:R Planejado:</span> <span className="text-white font-bold">{trade.plannedRR != null ? trade.plannedRR.toFixed(2) : "—"}</span></p>
          </div>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-xs font-bold text-slate-muted uppercase tracking-wider mb-3">Resultado</h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-slate-muted">Tipo:</span> <span className={`font-extrabold text-lg ${trade.resultType === "WIN" ? "text-emerald" : trade.resultType === "LOSS" ? "text-rose" : "text-sky"}`}>{trade.resultType}</span></p>
            <p><span className="text-slate-muted">$ Resultado:</span> <span className={`font-bold ${(trade.resultAmount || 0) >= 0 ? "text-emerald" : "text-rose"}`}>{(trade.resultAmount || 0) >= 0 ? "+" : ""}{formatCurrency(trade.resultAmount || 0)}</span></p>
            <p><span className="text-slate-muted">R Resultado:</span> <span className={`font-bold ${(trade.resultR || 0) >= 0 ? "text-emerald" : "text-rose"}`}>{trade.resultR != null ? formatR(trade.resultR) : "—"}</span></p>
          </div>
        </div>
      </div>

      <div className="glass-card-strong p-5 md:p-6 mb-6">
        <h2 className="text-base font-bold text-white mb-4">Contexto SMC</h2>
        {activeTags.length === 0 ? (
          <p className="text-xs text-slate-muted">Nenhum elemento SMC marcado para esta operação.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {activeTags.map((tag) => (
              <span key={tag.key} className="text-xs px-3 py-1.5 rounded-lg bg-emerald/10 text-emerald border border-emerald/15 text-center font-medium">{tag.label}</span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/5 text-xs text-slate-muted">
          <p>HTF Bias: <span className="text-white font-medium">{trade.htfBias || "—"}</span></p>
          <p>LTF Bias: <span className="text-white font-medium">{trade.ltfBias || "—"}</span></p>
          <p>Premium/Discount: <span className="text-white font-medium">{trade.premiumDiscount || "—"}</span></p>
        </div>
      </div>

      {(trade.macroEvent || trade.macroImpact) && (
        <div className="glass-card-strong p-5 md:p-6 mb-6">
          <h2 className="text-base font-bold text-white mb-3">Macroeconomia</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-muted">
            <p>Evento: <span className="text-white font-medium">{trade.macroEvent || "—"}</span></p>
            <p>Moeda: <span className="text-white font-medium">{trade.macroCurrency || "—"}</span></p>
            <p>Impacto: <span className="text-white font-medium">{trade.macroImpact || "—"}</span></p>
            <p>Viés: <span className="text-white font-medium">{trade.macroBias || "—"}</span></p>
          </div>
        </div>
      )}

      {trade.screenshotUrl && (
        <div className="glass-card-strong p-5 md:p-6 mb-6">
          <h2 className="text-base font-bold text-white mb-3">Screenshot</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trade.screenshotUrl} alt="Screenshot da operação" className="rounded-xl border border-white/10 max-w-full" />
        </div>
      )}

      <div className="glass-card-strong p-5 md:p-6">
        <h2 className="text-base font-bold text-white mb-3">Diário</h2>
        <div className="space-y-3 text-sm">
          {trade.whatWentRight && <p><span className="text-emerald font-semibold">✓ O que fiz certo:</span> <span className="text-slate-300">{trade.whatWentRight}</span></p>}
          {trade.whatWentWrong && <p><span className="text-rose font-semibold">✗ O que fiz errado:</span> <span className="text-slate-300">{trade.whatWentWrong}</span></p>}
          {trade.lesson && <p><span className="text-sky font-semibold">→ O que devo repetir:</span> <span className="text-slate-300">{trade.lesson}</span></p>}
          {trade.mistakes && <p><span className="text-amber font-semibold">⚠ Erros cometidos:</span> <span className="text-slate-300">{trade.mistakes}</span></p>}
          {trade.notes && <p><span className="text-slate-muted font-semibold">Notas:</span> <span className="text-slate-300">{trade.notes}</span></p>}
        </div>
        <div className="mt-4 pt-4 border-t border-white/5 flex gap-4">
          <span className="text-xs text-slate-muted">Antes: <span className="text-white">{trade.emotionalBefore || "—"}</span></span>
          <span className="text-xs text-slate-muted">Depois: <span className="text-emerald">{trade.emotionalAfter || "—"}</span></span>
          <span className="text-xs text-slate-muted">Seguiu o plano: <span className={trade.followedPlan ? "text-emerald" : "text-rose"}>{trade.followedPlan ? "Sim" : "Não"}</span></span>
        </div>
      </div>
    </div>
  );
}
