"use client";
/** Cards e painéis de leitura do módulo B3 (WIN/DOL). Todos recebem o B3AnalysisResult já calculado no backend. */
import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge, DeltaArrow, Notice, Section, classColor, fmtScore, riskColor, scoreBg, scoreColor } from "@/components/ai/ui";
import type { B3AnalysisResult, B3Candidate, B3EventRisk, DiCurveAnalysis, InstrumentScore, IntermarketRow, ScoreComponent } from "@/lib/b3/types";

export const REGIME_LABEL: Record<string, string> = { RISK_ON: "Risk-on", RISK_OFF: "Risk-off", DOMESTIC_BULLISH: "Doméstico positivo", DOMESTIC_BEARISH: "Doméstico negativo", MIXED: "Misto", HIGH_EVENT_RISK: "Alto risco de evento" };
export const regimeColor = (r: string) => r === "RISK_ON" || r === "DOMESTIC_BULLISH" ? "bg-emerald/15 text-emerald border-emerald/40" : r === "RISK_OFF" || r === "DOMESTIC_BEARISH" ? "bg-rose/15 text-rose border-rose/40" : r === "HIGH_EVENT_RISK" ? "bg-orange-500/15 text-orange-400 border-orange-500/40" : "bg-surface-2 text-text-secondary border-border";
const COMPONENT_LABEL: Record<string, string> = { BRAZIL_ACTIVITY: "Atividade BR", BRAZIL_INFLATION: "Inflação BR", BCB_POLICY: "BCB / Selic", DI_CURVE: "Curva DI", FISCAL_RISK: "Risco fiscal", BRL: "BRL", FOREIGN_FLOW: "Fluxo estrangeiro", US_EQUITIES: "Bolsas EUA", US_YIELDS: "Yields EUA", DXY: "DXY", CHINA: "China", IRON_ORE: "Minério", OIL: "Petróleo", GLOBAL_RISK_SENTIMENT: "Risk sentiment", COMMODITIES: "Commodities", CARRY: "Carry", USD_PRESSURE: "Pressão USD" };
export const compLabel = (k: string) => COMPONENT_LABEL[k] ?? k;

export function Dir({ d }: { d: string }) { return d === "UP" ? <ArrowUp size={13} className="text-emerald inline" /> : d === "DOWN" ? <ArrowDown size={13} className="text-rose inline" /> : d === "FLAT" ? <Minus size={13} className="text-text-muted inline" /> : <span className="text-[10px] text-text-muted">n/d</span>; }

function Card({ title, value, sub, tone, children }: { title: string; value: string; sub?: string; tone?: string; children?: React.ReactNode }) {
  return <div className="glass-card p-4 min-w-0"><div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">{title}</div><div className={`text-2xl font-extrabold mt-1 ${tone ?? "text-text-primary"}`}>{value}</div>{sub && <div className="text-[11px] text-text-muted mt-0.5 truncate" title={sub}>{sub}</div>}{children}</div>;
}

/** Spec item 16: WIN, DOL, USD, BRL, DI, Global Risk, China, Commodities, Next Events */
export function ScoreCards({ r }: { r: B3AnalysisResult }) {
  const next = r.event_risk.flatMap((e) => e.events).sort((a, b) => a.minutes_until - b.minutes_until).filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i).slice(0, 3);
  const g = r.global_risk;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <Card title="WIN Macro Score" value={fmtScore(r.win.score)} tone={scoreColor(r.win.score)} sub={`${r.win.bias} · conf. ${r.win.confidence} · cobertura ${(r.win.coverage * 100).toFixed(0)}%`}><div className="mt-1 flex items-center gap-1 text-[11px] text-text-muted"><DeltaArrow delta={r.win.delta} />{r.win.delta != null ? `${fmtScore(r.win.delta)} vs anterior` : "sem anterior"}</div></Card>
      <Card title="DOL Divergence" value={fmtScore(r.dol.divergence)} tone={scoreColor(r.dol.divergence)} sub={`${r.dol.bias} · USD ${fmtScore(r.dol.usd_score)} − BRL ${fmtScore(r.dol.brl_score)}`}><div className="mt-1 flex items-center gap-1 text-[11px] text-text-muted"><DeltaArrow delta={r.dol.delta} />conf. {r.dol.confidence}</div></Card>
      <Card title="USD (motor G8)" value={fmtScore(r.usd.score)} tone={scoreColor(r.usd.score)} sub={`${r.usd.bias} · ${r.usd.live_events} eventos vivos`} />
      <Card title="BRL" value={fmtScore(r.brl.score)} tone={scoreColor(r.brl.score)} sub={`${r.brl.bias} · conf. ${r.brl.confidence} · cobertura ${(r.brl.coverage * 100).toFixed(0)}%`}><div className="mt-1 flex items-center gap-1 text-[11px] text-text-muted"><DeltaArrow delta={r.brl.delta} />{r.brl.delta != null ? `${fmtScore(r.brl.delta)} vs anterior` : "sem anterior"}</div></Card>
      <Card title="Curva DI" value={r.di_curve ? (r.di_curve.shape === "UNKNOWN" ? "n/d" : r.di_curve.shape.replace("_", " ").toLowerCase()) : "sem dado"} tone="text-text-primary text-lg" sub={r.di_curve ? `curto ${r.di_curve.short.rate ?? "—"}% (${r.di_curve.short.change_bp ?? "—"}bp) · longo ${r.di_curve.long.rate ?? "—"}% (${r.di_curve.long.change_bp ?? "—"}bp) · causa ${r.di_curve.cause}` : "informe a curva na aba Curva DI"} />
      <Card title="Global risk" value={g.regime_hint === "UNKNOWN" ? "n/d" : g.regime_hint.replace("_", "-")} tone={g.regime_hint === "RISK_ON" ? "text-emerald text-lg" : g.regime_hint === "RISK_OFF" ? "text-rose text-lg" : "text-text-primary text-lg"} sub={g.score != null ? `score ${fmtScore(g.score)} · ${g.readings.length} leituras` : "sem leituras de S&P/NAS/US10Y/DXY/VIX"} />
      <Card title="China" value={r.china.score != null ? fmtScore(r.china.score) : "n/d"} tone={r.china.score != null ? scoreColor(r.china.score) : "text-text-muted"} sub={r.china.note} />
      <Card title="Commodities" value={r.commodities.score != null ? fmtScore(r.commodities.score) : "n/d"} tone={r.commodities.score != null ? scoreColor(r.commodities.score) : "text-text-muted"} sub={r.commodities.note} />
      <Card title="Fluxo estrangeiro" value={r.flow.classification === "UNKNOWN" ? "n/d" : r.flow.classification} tone={r.flow.classification === "INFLOW" ? "text-emerald text-lg" : r.flow.classification === "OUTFLOW" ? "text-rose text-lg" : "text-text-primary text-lg"} sub={r.flow.value_brl_mi != null ? `R$ ${r.flow.value_brl_mi.toFixed(0)} mi` : r.flow.note} />
      <Card title="Próximos eventos" value={next.length ? `${next[0].minutes_until} min` : "—"} tone="text-text-primary text-lg" sub={next.length ? `${next[0].currency} ${next[0].event}` : "nenhum evento relevante no horizonte"}>
        {next.slice(1).map((e) => <div key={e.id} className="text-[10px] text-text-muted truncate">{e.currency} {e.event} · {e.minutes_until} min</div>)}
      </Card>
    </div>
  );
}

export function ComponentTable({ comps, title, sub }: { comps: ScoreComponent[]; title: string; sub?: string }) {
  return (
    <Section title={title} sub={sub}>
      <div className="overflow-x-auto"><table className="w-full text-xs">
        <thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-2">Componente</th><th className="py-1.5 pr-2">Score</th><th className="py-1.5 pr-2">Peso</th><th className="py-1.5 pr-2">Conf.</th><th className="py-1.5">Motivo / fonte</th></tr></thead>
        <tbody>{comps.map((c) => (
          <tr key={c.key} className="border-b border-border/50 align-top">
            <td className="py-1.5 pr-2 font-bold text-text-primary whitespace-nowrap">{compLabel(c.key)}</td>
            <td className="py-1.5 pr-2">{c.score == null ? <Badge className="bg-surface-2 text-text-muted border-border">sem dado</Badge> : <Badge className={scoreBg(c.score)}>{fmtScore(c.score)}</Badge>}</td>
            <td className="py-1.5 pr-2 text-text-secondary">{c.weight.toFixed(1)}</td>
            <td className="py-1.5 pr-2 text-text-secondary">{c.confidence}</td>
            <td className="py-1.5 text-text-secondary">{c.reason}{c.source && <span className="text-text-muted"> · {c.source}</span>}{c.requires_manual_confirmation && <span className="text-amber"> · confirmar manualmente</span>}</td>
          </tr>))}</tbody>
      </table></div>
    </Section>
  );
}

export function InstrumentHeader({ name, s, extra }: { name: string; s: InstrumentScore; extra?: React.ReactNode }) {
  return (
    <div className="glass-card p-4 flex flex-wrap items-center gap-4">
      <div><div className="text-[11px] uppercase tracking-wider text-text-muted font-bold">{name}</div><div className={`text-3xl font-extrabold ${scoreColor(s.score)}`}>{fmtScore(s.score)}</div></div>
      <Badge className={classColor(s.bias) + " border-border"}>{s.bias}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">confiança {s.confidence}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">cobertura {(s.coverage * 100).toFixed(0)}%</Badge>
      {s.previous_score != null && <span className="text-xs text-text-muted inline-flex items-center gap-1"><DeltaArrow delta={s.delta} /> anterior {fmtScore(s.previous_score)}</span>}
      {extra}
      {s.drivers.length > 0 && <div className="w-full text-xs text-text-secondary"><span className="text-text-muted">Drivers:</span> {s.drivers.join(" · ")}</div>}
    </div>
  );
}

export function DiCurvePanel({ di }: { di: DiCurveAnalysis | null }) {
  if (!di) return <Notice kind="warn">Sem curva DI registrada. Informe os contratos (ex.: DI1F27 / DI1F29 / DI1F31) ou envie um screenshot da curva.</Notice>;
  const row = (label: string, t: DiCurveAnalysis["short"]) => <tr className="border-b border-border/50"><td className="py-1.5 pr-3 font-bold text-text-primary">{label}</td><td className="py-1.5 pr-3">{t.code ?? "—"}</td><td className="py-1.5 pr-3">{t.rate != null ? `${t.rate.toFixed(2)}%` : "—"}</td><td className={`py-1.5 pr-3 ${t.change_bp != null ? (t.change_bp > 0 ? "text-rose" : t.change_bp < 0 ? "text-emerald" : "") : ""}`}>{t.change_bp != null ? `${t.change_bp > 0 ? "+" : ""}${t.change_bp} bp` : "—"}</td><td className="py-1.5"><Dir d={t.state} /></td></tr>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Curva DI" sub="Nível, variação diária e inclinação (longo − curto). DI subindo é negativo para o Ibovespa, mas a CAUSA define o tamanho do efeito.">
        <table className="w-full text-xs"><thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-3">Vértice</th><th className="py-1.5 pr-3">Contrato</th><th className="py-1.5 pr-3">Taxa</th><th className="py-1.5 pr-3">Δ dia</th><th className="py-1.5">Estado</th></tr></thead>
          <tbody>{row("Curto", di.short)}{row("Médio", di.mid)}{row("Longo", di.long)}</tbody></table>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><Badge className="bg-surface-2 text-text-secondary border-border">forma: {di.shape}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">inclinação {di.slope_bp != null ? `${di.slope_bp} bp` : "n/d"}{di.slope_change_bp != null ? ` (Δ ${di.slope_change_bp > 0 ? "+" : ""}${di.slope_change_bp})` : ""}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">causa: {di.cause}</Badge></div>
        {di.requires_manual_confirmation && <div className="mt-2"><Notice kind="warn">Leitura incompleta — confirme taxas/variações manualmente antes de confiar no componente DI.</Notice></div>}
      </Section>
      <Section title="Interpretação" sub="O motor nunca decide a direção do WIN só pelo DI: ele combina com a causa, fiscal, BRL e exterior.">
        <p className="text-sm text-text-secondary leading-relaxed">{di.interpretation}</p>
        <div className="mt-3 flex gap-2 text-xs"><Badge className={di.equity_implication === "SUPPORTIVE" ? "bg-emerald/15 text-emerald border-emerald/40" : di.equity_implication === "PRESSURE" ? "bg-rose/15 text-rose border-rose/40" : "bg-surface-2 text-text-secondary border-border"}>Bolsa: {di.equity_implication}</Badge><Badge className={di.brl_implication === "SUPPORTIVE" ? "bg-emerald/15 text-emerald border-emerald/40" : di.brl_implication === "PRESSURE" ? "bg-rose/15 text-rose border-rose/40" : "bg-surface-2 text-text-secondary border-border"}>BRL: {di.brl_implication}</Badge></div>
      </Section>
    </div>
  );
}

export function IntermarketTable({ rows, filter }: { rows: IntermarketRow[]; filter?: "WIN" | "DOL" }) {
  const list = filter ? rows.filter((r) => r.applies_to.includes(filter)) : rows;
  if (!list.length) return <Notice kind="info">Sem leituras de mercado. Use a aba Exterior para registrar DXY, US10Y, S&P500, NAS100, Brent, minério, VIX e fluxo (manual ou screenshot).</Notice>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="text-left text-text-muted border-b border-border"><th className="py-1.5 pr-2">Mercado</th><th className="py-1.5 pr-2">Valor</th><th className="py-1.5 pr-2">Δ dia</th><th className="py-1.5 pr-2">Direção</th><th className="py-1.5 pr-2">Contribuição</th><th className="py-1.5 pr-2">Aplica a</th><th className="py-1.5">Aviso de correlação</th></tr></thead>
      <tbody>{list.map((r) => (
        <tr key={r.symbol} className="border-b border-border/50">
          <td className="py-1.5 pr-2 font-bold text-text-primary whitespace-nowrap">{r.label}{r.stale && <span className="text-amber text-[10px]"> · antigo</span>}</td>
          <td className="py-1.5 pr-2 text-text-secondary">{r.value ?? "—"}</td>
          <td className={`py-1.5 pr-2 ${r.change_pct != null ? (r.change_pct > 0 ? "text-emerald" : r.change_pct < 0 ? "text-rose" : "") : r.change_bp != null ? (r.change_bp > 0 ? "text-rose" : r.change_bp < 0 ? "text-emerald" : "") : "text-text-muted"}`}>{r.change_pct != null ? `${r.change_pct > 0 ? "+" : ""}${r.change_pct.toFixed(2)}%` : r.change_bp != null ? `${r.change_bp > 0 ? "+" : ""}${r.change_bp} bp` : "—"}</td>
          <td className="py-1.5 pr-2"><Dir d={r.direction} /></td>
          <td className="py-1.5 pr-2">{r.score_contribution == null ? <span className="text-text-muted">—</span> : <Badge className={scoreBg(r.score_contribution)}>{fmtScore(r.score_contribution)}</Badge>}</td>
          <td className="py-1.5 pr-2 text-text-muted">{r.applies_to.join(" / ")}</td>
          <td className="py-1.5 text-amber">{r.correlation_warning ?? ""}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

export function EventRiskB3({ risks }: { risks: B3EventRisk[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {risks.map((r) => (
        <Section key={r.instrument} title={`Event risk — ${r.instrument === "WIN" ? "WIN (mini índice)" : "DOL / WDO (dólar)"}`} sub={r.next_key_event ? `Próximo evento-chave: ${r.next_key_event}` : "Sem evento-chave no horizonte"} right={<Badge className={riskColor(r.level)}>{r.level}</Badge>}>
          {r.events.length === 0 ? <p className="text-xs text-text-muted">Nenhum evento BR/EUA/China relevante nas próximas horas.</p> : (
            <ul className="space-y-1.5 text-xs">{r.events.slice(0, 10).map((e) => <li key={e.id} className="flex items-center justify-between gap-2 border-b border-border/40 pb-1"><span className="min-w-0 truncate"><span className="font-bold text-text-primary">{e.currency}</span> {e.event}{e.key_event && <Badge className="ml-1 bg-orange-500/15 text-orange-400 border-orange-500/40">chave</Badge>}</span><span className="text-text-muted whitespace-nowrap">{e.minutes_until} min · {e.impact}</span></li>)}</ul>
          )}
          {r.level === "EXTREME" && <div className="mt-2"><Notice kind="error">Não abrir operação nova — aguarde a divulgação e a reação (sweep + MSS) antes de reavaliar.</Notice></div>}
        </Section>
      ))}
    </div>
  );
}

export function CandidateCards({ cands, onOpenSmc }: { cands: B3Candidate[]; onOpenSmc?: (c: B3Candidate) => void }) {
  if (!cands.length) return <Notice kind="info">Sem candidatos: |WIN score| &lt; 0.75 e |DOL divergence| abaixo do limiar, ou event risk EXTREME. Macro neutra = sem edge direcional; não force operação.</Notice>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cands.map((c) => (
        <div key={`${c.instrument}-${c.bias}`} className="glass-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between"><div className="text-lg font-extrabold text-text-primary">{c.instrument} <span className={c.bias === "LONG" ? "text-emerald" : "text-rose"}>{c.bias}</span></div><Badge className={riskColor(c.event_risk)}>risco {c.event_risk}</Badge></div>
          <div className="flex flex-wrap gap-2 text-[11px]"><Badge className={scoreBg(c.score)}>{c.instrument === "WIN" ? "WIN" : "div."} {fmtScore(c.score)}</Badge>{c.usd_score != null && <Badge className="bg-surface-2 text-text-secondary border-border">USD {fmtScore(c.usd_score)}</Badge>}{c.brl_score != null && <Badge className="bg-surface-2 text-text-secondary border-border">BRL {fmtScore(c.brl_score)}</Badge>}<Badge className={regimeColor(c.regime)}>{REGIME_LABEL[c.regime]}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">conf. {c.confidence}</Badge><Badge className="bg-surface-2 text-text-secondary border-border">prioridade {c.priority}</Badge></div>
          <p className="text-xs text-text-secondary leading-relaxed">{c.reason}</p>
          <div className="text-[11px] text-amber flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Macro é contexto, nunca gatilho. POI não é entrada: exija sweep → displacement → MSS → reteste no SMC/ICT.</div>
          {onOpenSmc && <button onClick={() => onOpenSmc(c)} className="mt-auto self-start text-xs font-bold text-accent hover:underline">Abrir no SMC/ICT →</button>}
        </div>
      ))}
    </div>
  );
}

export function AlertList({ alerts }: { alerts: B3AnalysisResult["alerts"] }) {
  if (!alerts.length) return null;
  return <div className="space-y-2">{alerts.map((a, i) => <Notice key={i} kind={a.level === "DANGER" ? "error" : a.level === "WARNING" ? "warn" : "info"}><span className="font-bold">{a.instrument === "BOTH" ? "WIN+DOL" : a.instrument}</span> · {a.message}</Notice>)}</div>;
}
