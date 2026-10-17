"use client";
/** Mini-relatórios executivos: equity curve em R, mapa hora×dia e distribuição de R. */
import type { Trade } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { tradeDayKey, weekdayIndex } from "@/lib/date";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function DashboardInsights({ trades }: { trades: Trade[] }) {
  const closed = trades
    .filter((t) => t.resultR != null && Number.isFinite(Number(t.resultR)))
    .slice()
    .sort((a, b) => tradeDayKey(a.date).localeCompare(tradeDayKey(b.date)) || (a.time || "").localeCompare(b.time || "") || a.id - b.id);

  const curve = [] as { x: number; y: number; label: string; r: number }[];
  let totalR = 0;
  let peak = 0;
  let maxDd = 0;
  closed.forEach((t, i) => {
    totalR += Number(t.resultR) || 0;
    peak = Math.max(peak, totalR);
    maxDd = Math.max(maxDd, peak - totalR);
    curve.push({ x: i, y: totalR, label: tradeDayKey(t.date), r: Number(t.resultR) || 0 });
  });

  const matrix = Array.from({ length: 24 }, () => Array.from({ length: 7 }, () => ({ sum: 0, n: 0 })));
  for (const t of closed) {
    const hh = Number((t.time || "00:00").slice(0, 2));
    const day = weekdayIndex(tradeDayKey(t.date));
    if (Number.isInteger(hh) && hh >= 0 && hh < 24 && Number.isFinite(day)) {
      const cell = matrix[hh][day];
      cell.sum += Number(t.resultR) || 0;
      cell.n += 1;
    }
  }
  const maxAbsAvg = Math.max(0.25, ...matrix.flatMap((row) => row.map((c) => c.n ? Math.abs(c.sum / c.n) : 0)));

  const distribution = [
    { label: "≤ −3R", min: -Infinity, max: -3 },
    { label: "−3 a −2R", min: -3, max: -2 },
    { label: "−2 a −1R", min: -2, max: -1 },
    { label: "−1 a 0R", min: -1, max: -0.000001 },
    { label: "0R", min: -0.000001, max: 0.000001 },
    { label: "0 a 1R", min: 0.000001, max: 1 },
    { label: "1 a 2R", min: 1, max: 2 },
    { label: "2 a 3R", min: 2, max: 3 },
    { label: "≥ 3R", min: 3, max: Infinity },
  ].map((b) => ({ ...b, count: closed.filter((t) => { const r = Number(t.resultR) || 0; return r >= b.min && r < b.max; }).length }));
  const maxCount = Math.max(1, ...distribution.map((b) => b.count));

  return (
    <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
      <div className="glass-card-strong p-5 md:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-text-primary">Curva de capital em R</h2>
            <p className="text-[11px] text-text-muted">Acumulado de R realizado · {closed.length} operações com risco definido</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-extrabold ${totalR >= 0 ? "text-emerald" : "text-rose"}`}>{totalR > 0 ? "+" : ""}{formatNumber(totalR)}R</p>
            <p className="text-[10px] text-text-muted">DD máx. {formatNumber(maxDd)}R</p>
          </div>
        </div>
        {curve.length < 2 ? (
          <p className="text-xs text-text-muted py-12 text-center">Registre operações com risco definido para ver a curva em R.</p>
        ) : (
          <EquitySvg points={downsample(curve.map((p) => p.y), 600)} labels={[curve[0].label, curve[Math.floor(curve.length / 2)].label, curve[curve.length - 1].label]} />
        )}
      </div>

      <div className="glass-card-strong p-5 md:p-6">
        <div className="mb-4">
          <h2 className="text-base font-bold text-text-primary">Mapa de resultado · hora × dia</h2>
          <p className="text-[11px] text-text-muted">Média de R por operação em cada faixa horária (fuso usado no registro).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[440px] border-separate border-spacing-1 text-[10px]">
            <thead><tr><th className="w-10 text-left text-text-muted font-medium">Hora</th>{[1, 2, 3, 4, 5, 6, 0].map((d) => <th key={d} className="text-center text-text-muted font-semibold">{DAY_LABELS[d]}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: 24 }, (_, hour) => (
                <tr key={hour}>
                  <th className="text-left text-text-muted font-medium">{String(hour).padStart(2, "0")}</th>
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                    const c = matrix[hour][day];
                    const avg = c.n ? c.sum / c.n : 0;
                    const opacity = c.n ? Math.min(0.88, 0.22 + Math.abs(avg) / maxAbsAvg * 0.66) : 0.035;
                    const bg = c.n ? (avg > 0 ? `rgba(16,185,129,${opacity})` : avg < 0 ? `rgba(244,63,94,${opacity})` : `rgba(148,163,184,0.16)`) : "rgba(148,163,184,0.035)";
                    return <td key={day} title={c.n ? `${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 · ${c.n} op · ${avg > 0 ? "+" : ""}${formatNumber(avg)}R média` : `${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 · sem operações`} className="h-[15px] rounded-sm text-center tabular-nums" style={{ background: bg, color: c.n ? (avg >= 0 ? "#6ee7b7" : "#fda4af") : "transparent" }}>{c.n ? formatNumber(avg, 1) : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-text-muted"><span className="text-emerald">■ positivo</span><span className="text-rose">■ negativo</span><span>célula = média R (número de operações via tooltip)</span></div>
      </div>

      <div className="glass-card-strong p-5 md:p-6 xl:col-span-2">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div><h2 className="text-base font-bold text-text-primary">Distribuição dos resultados (R)</h2><p className="text-[11px] text-text-muted">Ajuda a ver onde se concentra o payoff da estratégia.</p></div>
          <span className="text-xs font-bold text-text-secondary">{closed.length} ops</span>
        </div>
        {closed.length === 0 ? <p className="text-xs text-text-muted py-6 text-center">Sem resultado R disponível.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2">
            {distribution.map((b) => (
              <div key={b.label} className="glass-card p-2.5 rounded-xl text-center" title={`${b.count} operações`}>
                <p className="text-[10px] text-text-muted truncate">{b.label}</p>
                <div className="h-10 flex items-end justify-center my-1"><div className={`w-5 rounded-t ${b.label.startsWith("−") || b.label.startsWith("≤") ? "bg-rose/70" : b.label === "0R" ? "bg-sky/70" : "bg-emerald/70"}`} style={{ height: `${Math.max(4, (b.count / maxCount) * 40)}px` }} /></div>
                <p className="text-xs font-extrabold text-text-primary">{b.count}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EquitySvg({ points, labels }: { points: number[]; labels: string[] }) {
  const width = 600;
  const height = 210;
  const pad = { l: 38, r: 12, t: 12, b: 28 };
  const min = points.reduce((a, b) => Math.min(a, b), 0);
  const max = points.reduce((a, b) => Math.max(a, b), 0);
  const spread = Math.max(0.5, max - min);
  const y = (v: number) => pad.t + (max - v) / spread * (height - pad.t - pad.b);
  const x = (i: number) => pad.l + (points.length < 2 ? 0 : i / (points.length - 1) * (width - pad.l - pad.r));
  const polyline = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const zero = y(0);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => min + spread * p);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Curva acumulada de R">
      {grid.map((v, i) => <g key={i}><line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeOpacity="0.45" strokeDasharray="3 4" /><text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fill="currentColor" className="text-text-muted" fontSize="9">{formatNumber(v, 1)}R</text></g>)}
      <line x1={pad.l} x2={width - pad.r} y1={zero} y2={zero} stroke="currentColor" className="text-text-muted" strokeOpacity="0.5" />
      <polyline points={polyline} fill="none" stroke="currentColor" className={points[points.length - 1] >= 0 ? "text-emerald" : "text-rose"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="4" fill="currentColor" className={points[points.length - 1] >= 0 ? "text-emerald" : "text-rose"} />
      {[0, Math.floor(labels.length / 2), labels.length - 1].map((i, idx) => <text key={`${idx}-${i}`} x={pad.l + i / Math.max(1, labels.length - 1) * (width - pad.l - pad.r)} y={height - 7} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} fill="currentColor" className="text-text-muted" fontSize="9">{labels[i]}</text>)}
    </svg>
  );
}

function downsample(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  const sampled: number[] = [];
  for (let i = 0; i < maxPoints - 1; i++) sampled.push(values[Math.floor(i * step)]);
  sampled.push(values[values.length - 1]);
  return sampled;
}
