"use client";
import { useEffect, useState } from "react";
import { BarChart3, FlaskConical } from "lucide-react";
import { Badge, Notice, PageHeader, Section, Spinner, Tabs } from "@/components/ai/ui";
import { apiFetch } from "@/lib/ai/client";
import type { MaeMfeStats, Observation, StatBucket } from "@/lib/journal/stats";

interface Stats { total: StatBucket; by_session: StatBucket[]; by_symbol: StatBucket[]; by_direction: StatBucket[]; by_setup_grade: StatBucket[]; by_entry_model: StatBucket[]; by_mss_timeframe: StatBucket[]; by_mss_type: StatBucket[]; by_divergence: StatBucket[]; by_weekday: StatBucket[]; by_error_tag: StatBucket[]; by_regime: StatBucket[]; by_macro_score: StatBucket[]; by_di_alignment: StatBucket[]; by_dxy_alignment: StatBucket[]; by_instrument: StatBucket[]; by_event_risk: StatBucket[]; filters?: { market: string; instrument: string | null }; mae_mfe: MaeMfeStats; observations: Observation[]; min_sample: number }
const DIMS = [["by_session", "Sessão"], ["by_symbol", "Ativo"], ["by_direction", "Direção"], ["by_setup_grade", "Grade"], ["by_entry_model", "Modelo"], ["by_mss_timeframe", "MSS timeframe"], ["by_mss_type", "MSS tipo"], ["by_divergence", "Divergência macro"], ["by_weekday", "Dia da semana"], ["by_error_tag", "Tag de erro"], ["by_instrument", "Mercado / instrumento"], ["by_regime", "Regime B3"], ["by_macro_score", "Macro score (B3)"], ["by_di_alignment", "Alinhamento DI"], ["by_dxy_alignment", "Alinhamento DXY"], ["by_event_risk", "Event risk na entrada"]] as const;
const MARKETS = [["ALL", "Todos"], ["FOREX", "Forex"], ["B3", "B3 (WIN/DOL/WDO)"], ["WIN", "WIN"], ["DOL", "DOL"], ["WDO", "WDO"]] as const;
type DimKey = (typeof DIMS)[number][0];
const f2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const pct = (v: number) => `${v.toFixed(0)}%`; // win_rate já vem em %

function BucketTable({ rows, min }: { rows: StatBucket[]; min: number }) {
  if (!rows.length) return <p className="text-xs text-text-muted">Sem dados fechados nesta dimensão.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs tabular-nums">
      <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr>{["Bucket", "n", "Win rate", "Avg R", "Profit factor", "Expectancy", "MAE méd.", "MFE méd.", "PnL"].map((h) => <th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.key} className="border-t border-border">
          <td className="px-2 py-1.5 font-bold text-text-primary">{r.key}{r.n < min && <span className="ml-1 text-[9px] text-amber font-bold" title={`Amostra abaixo de ${min}`}>n&lt;{min}</span>}</td>
          <td className="px-2 py-1.5">{r.n}</td>
          <td className={`px-2 py-1.5 font-bold ${r.win_rate >= 50 ? "text-emerald" : "text-rose"}`}>{pct(r.win_rate)}</td>
          <td className={`px-2 py-1.5 ${(r.avg_r ?? 0) >= 0 ? "text-emerald" : "text-rose"}`}>{f2(r.avg_r)}</td>
          <td className="px-2 py-1.5">{r.profit_factor == null ? "—" : r.profit_factor === Infinity ? "∞" : r.profit_factor.toFixed(2)}</td>
          <td className={`px-2 py-1.5 ${(r.expectancy ?? 0) >= 0 ? "text-emerald" : "text-rose"}`}>{f2(r.expectancy)}</td>
          <td className="px-2 py-1.5">{f2(r.avg_mae)}</td><td className="px-2 py-1.5">{f2(r.avg_mfe)}</td>
          <td className={`px-2 py-1.5 ${r.pnl >= 0 ? "text-emerald" : "text-rose"}`}>{r.pnl.toFixed(2)}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

export default function EstatisticasPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dim, setDim] = useState<DimKey>("by_session");
  const [market, setMarket] = useState<(typeof MARKETS)[number][0]>("ALL");
  useEffect(() => {
    const q = market === "ALL" ? "" : market === "FOREX" || market === "B3" ? `?market=${market}` : `?market=B3&instrument=${market}`;
    apiFetch<Stats>(`/api/journal/stats${q}`).then(setData).catch((e) => setErr(e.message));
  }, [market]);
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <PageHeader icon={BarChart3} title="Estatísticas do processo" sub="Win rate, R médio, profit factor, expectancy, MAE/MFE por dimensão. Padrões só viram conclusão com amostra relevante — antes disso são OBSERVAÇÕES." right={<div className="flex items-center gap-1.5 text-xs flex-wrap"><span className="text-text-muted">Mercado</span>{MARKETS.map(([k, l]) => <button key={k} onClick={() => setMarket(k)} className={`px-2.5 py-1.5 rounded-lg border font-bold ${market === k ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary"}`}>{l}</button>)}</div>} />
      {err && <Notice kind="error">{err}</Notice>}
      {!data ? <Spinner label="Calculando..." /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {[["Trades fechados", String(data.total.n)], ["Win rate", pct(data.total.win_rate)], ["Avg R", f2(data.total.avg_r)], ["Profit factor", data.total.profit_factor == null ? "—" : data.total.profit_factor === Infinity ? "∞" : data.total.profit_factor.toFixed(2)], ["Expectancy (R)", f2(data.total.expectancy)], ["Soma R", f2(data.total.sum_r)], ["MAE médio", f2(data.total.avg_mae)], ["MFE médio", f2(data.total.avg_mfe)]].map(([l, v]) => (
              <div key={l} className="glass-card p-3"><p className="text-[10px] uppercase tracking-wider text-text-muted">{l}</p><p className="text-lg font-extrabold text-text-primary mt-1">{v}</p></div>
            ))}
          </div>
          <Section title="Observações e aprendizados" sub={`Marcados como OBSERVATION até n ≥ ${data.min_sample}; só então viram SIGNIFICANT.`}>
            {data.observations.length === 0 ? <p className="text-xs text-text-muted">Ainda sem padrões detectáveis. Registre contexto (grade, modelo, MSS, divergência) em cada trade.</p> : (
              <ul className="space-y-1.5">{data.observations.map((o, i) => <li key={i} className="flex items-start gap-2 text-xs text-text-secondary"><Badge className={o.kind === "SIGNIFICANT" ? "border-emerald/40 text-emerald" : "border-amber/40 text-amber"}><FlaskConical size={10} />{o.kind}</Badge><span>{o.text} <span className="text-text-muted">(n={o.n})</span></span></li>)}</ul>
            )}
          </Section>
          <Section title="MAE / MFE — winners vs losers" sub="Base para stop e gestão: se losers têm MFE alto, há gestão a melhorar; se winners têm MAE alto, o stop pode estar na estrutura errada.">
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3"><p className="font-extrabold text-emerald">Winners (n={data.mae_mfe.winners.n})</p><p className="text-text-secondary mt-1">MAE médio {f2(data.mae_mfe.winners.avg_mae)}R · MFE médio {f2(data.mae_mfe.winners.avg_mfe)}R</p></div>
              <div className="rounded-xl border border-rose/30 bg-rose/5 p-3"><p className="font-extrabold text-rose">Losers (n={data.mae_mfe.losers.n})</p><p className="text-text-secondary mt-1">MAE médio {f2(data.mae_mfe.losers.avg_mae)}R · MFE médio {f2(data.mae_mfe.losers.avg_mfe)}R</p></div>
            </div>
            {data.mae_mfe.insights.length > 0 && <ul className="mt-2 text-xs text-text-secondary list-disc pl-4">{data.mae_mfe.insights.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </Section>
          <Section title="Por dimensão" right={<Tabs tabs={DIMS.map(([id, label]) => ({ id, label }))} value={dim} onChange={setDim} />}>
            <BucketTable rows={data[dim]} min={data.min_sample} />
          </Section>
        </div>
      )}
    </div>
  );
}
