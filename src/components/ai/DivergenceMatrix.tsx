"use client";
import type { CurrencyScoreView, TradeCandidateView } from "@/lib/ai/types";
import { G8 } from "@/lib/ai/types";
import { Badge, riskColor, scoreBg } from "./ui";

export function DivergenceMatrix({ scores }: { scores: CurrencyScoreView[] }) {
  const map = Object.fromEntries(scores.map((s) => [s.currency, s.score])) as Record<string, number>;
  const order = [...G8].sort((a, b) => (map[b] ?? 0) - (map[a] ?? 0));
  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] tabular-nums">
        <thead><tr><th className="px-1.5 py-1 text-text-muted text-left">linha − coluna</th>{order.map((c) => <th key={c} className="px-1.5 py-1 text-text-muted">{c}</th>)}</tr></thead>
        <tbody>
          {order.map((r) => (
            <tr key={r}>
              <td className="px-1.5 py-1 font-extrabold text-text-primary">{r} <span className={`ml-1 px-1 rounded ${scoreBg(map[r] ?? 0)}`}>{(map[r] ?? 0).toFixed(2)}</span></td>
              {order.map((c) => {
                if (r === c) return <td key={c} className="px-1.5 py-1 text-center text-text-muted">·</td>;
                const d = (map[r] ?? 0) - (map[c] ?? 0);
                const strong = Math.abs(d) >= 1.5, ok = Math.abs(d) >= 1.0;
                return <td key={c} className={`px-1.5 py-1 text-center rounded ${ok ? (d > 0 ? (strong ? "bg-emerald/25 text-emerald font-bold" : "bg-emerald/10 text-emerald") : (strong ? "bg-rose/25 text-rose font-bold" : "bg-rose/10 text-rose")) : "text-text-muted"}`}>{d > 0 ? "+" : ""}{d.toFixed(2)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-text-muted mt-2">Divergência = score(linha) − score(coluna). Verde/vermelho a partir de |1.0|; destaque forte a partir de |1.5|. Positivo = comprar a moeda da linha contra a da coluna.</p>
    </div>
  );
}

export function TradeCandidates({ candidates, onPick }: { candidates: TradeCandidateView[]; onPick?: (c: TradeCandidateView) => void }) {
  if (!candidates.length) return <p className="text-xs text-text-muted">Nenhum par com divergência ≥ 1.0 no momento — sem candidatos macro.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {candidates.map((c) => (
        <div key={c.symbol} className="rounded-xl border border-border bg-surface-2/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-text-muted">P{c.priority}</span>
              <span className="text-sm font-extrabold text-text-primary">{c.symbol}</span>
              <Badge className={c.bias === "LONG" ? "bg-emerald/15 text-emerald border-emerald/40" : "bg-rose/15 text-rose border-rose/40"}>{c.bias}</Badge>
            </div>
            <Badge className={riskColor(c.event_risk)}>risco {c.event_risk}</Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-emerald font-bold">{c.strong_currency} {c.strong_score > 0 ? "+" : ""}{c.strong_score.toFixed(2)}</span>
            <span className="text-text-muted">vs</span>
            <span className="text-rose font-bold">{c.weak_currency} {c.weak_score > 0 ? "+" : ""}{c.weak_score.toFixed(2)}</span>
            <span className="ml-auto font-extrabold text-text-primary tabular-nums">Δ {c.macro_divergence.toFixed(2)}</span>
            <Badge className={c.confidence === "HIGH" ? "border-emerald/40 text-emerald" : c.confidence === "MEDIUM" ? "border-amber/40 text-amber" : "border-border text-text-muted"}>{c.confidence}</Badge>
          </div>
          {c.event_risk_events.length > 0 && <p className="mt-1.5 text-[10px] text-amber">⚠ {c.event_risk_events.slice(0, 2).map((e) => `${e.currency} ${e.event} em ${e.minutes_until < 60 ? `${e.minutes_until}min` : `${(e.minutes_until / 60).toFixed(1)}h`}`).join(" · ")}</p>}
          <p className="mt-1.5 text-[11px] text-text-secondary leading-snug line-clamp-4">{c.reason}</p>
          {onPick && <button onClick={() => onPick(c)} className="mt-2 text-[11px] font-bold text-accent hover:underline">Analisar no SMC/ICT →</button>}
        </div>
      ))}
    </div>
  );
}
