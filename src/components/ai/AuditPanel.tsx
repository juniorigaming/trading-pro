"use client";
/** Modo auditoria: mostra, em ordem, tudo que levou ao ranking — para localizar exatamente onde uma divergência nasce. */
import type { AnalysisAudit, MacroAnalysisResult } from "@/lib/ai/types";

type Preview = { id: string; previewUrl: string; name?: string };

function Block({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-extrabold text-text-primary mb-2"><span className="text-accent mr-1.5">{n}.</span>{title}</p>
      {children}
    </div>
  );
}

const Pre = ({ value }: { value: unknown }) => (
  <pre className="text-[10px] leading-snug text-text-secondary bg-surface-2 rounded-lg p-2 overflow-auto max-h-80 whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>
);

export default function AuditPanel({ result, previews = [] }: { result: MacroAnalysisResult; previews?: Preview[] }) {
  const audit: AnalysisAudit | undefined = result.audit;
  const ex = audit?.extraction ?? null;
  const ranked = result.currencies.filter((c) => c.status === "EVALUATED").sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const insufficient = result.currencies.filter((c) => c.status !== "EVALUATED");

  return (
    <div className="space-y-3">
      <div className="glass-card p-3 text-xs text-text-muted flex flex-wrap gap-x-4 gap-y-1">
        <span>análise <b className="text-text-primary">#{result.analysis_id}</b></span>
        <span>status <b className={result.analysis_status === "OK" ? "text-emerald" : "text-rose"}>{result.analysis_status ?? "OK"}</b></span>
        <span>verificação visual <b className="text-text-primary">{ex?.visual_verification ?? "não se aplica"}</b></span>
        <span>tabela de regras <b className="text-text-primary">{result.meta.scoring_version}</b></span>
        <span>classificação <b className="text-text-primary">{result.meta.model ?? "—"}</b></span>
      </div>

      <Block n={1} title="Screenshot recebido">
        {previews.length ? (
          <div className="flex flex-wrap gap-2">{previews.map((p) => <img key={p.id} src={p.previewUrl} alt={p.name ?? "screenshot"} className="max-h-64 rounded-lg border border-border" />)}</div>
        ) : <p className="text-xs text-text-muted">Imagem não disponível nesta sessão (análises do histórico mostram os dados extraídos abaixo).</p>}
      </Block>

      <Block n={2} title="Texto/OCR extraído (transcrição literal de cada linha aceita)">
        {ex ? (
          <ul className="space-y-1">{ex.accepted.map((a, i) => (
            <li key={i} className="text-[11px] font-mono text-text-secondary bg-surface-2 rounded px-2 py-1 break-all">{a.raw_row_text ?? "—"}</li>
          ))}</ul>
        ) : <p className="text-xs text-text-muted">Sem extração por IA (entrada manual).</p>}
      </Block>

      <Block n={3} title="JSON bruto retornado pela IA">
        {ex ? <details><summary className="text-xs text-text-muted cursor-pointer">ver JSON bruto ({ex.rows_received} linha(s) recebida(s))</summary><div className="mt-2"><Pre value={ex.raw_json} /></div></details> : <p className="text-xs text-text-muted">—</p>}
      </Block>

      <Block n={4} title="JSON validado (o que o código aceitou)">
        {ex ? <details><summary className="text-xs text-text-muted cursor-pointer">ver JSON validado ({ex.accepted.length} evento(s))</summary><div className="mt-2"><Pre value={ex.accepted} /></div></details> : <p className="text-xs text-text-muted">—</p>}
      </Block>

      <Block n={5} title={`Eventos aceitos (${ex?.accepted.length ?? "—"})`}>
        {ex && ex.accepted.length > 0 ? (
          <div className="overflow-auto"><table className="w-full text-[11px]">
            <thead className="text-text-muted text-left"><tr><th className="pr-2">moeda</th><th className="pr-2">horário</th><th className="pr-2">evento</th><th className="pr-2">atual</th><th className="pr-2">forecast</th><th className="pr-2">previous</th><th>conf.</th></tr></thead>
            <tbody>{ex.accepted.map((a, i) => (
              <tr key={i} className="border-t border-border"><td className="pr-2 font-bold">{a.currency}</td><td className="pr-2">{a.time ?? "—"}</td><td className="pr-2">{a.event}</td><td className="pr-2 tabular-nums">{a.actual ?? "—"}</td><td className="pr-2 tabular-nums">{a.forecast ?? "—"}</td><td className="pr-2 tabular-nums">{a.previous ?? "—"}</td><td className="tabular-nums">{a.confidence ?? "—"}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-xs text-text-muted">Nenhum evento aceito pela extração.</p>}
      </Block>

      <Block n={6} title={`Eventos rejeitados (${(ex?.rejected.length ?? 0) + (ex?.values_discarded.length ?? 0)})`}>
        {ex && (ex.rejected.length + ex.values_discarded.length) > 0 ? (
          <ul className="space-y-1 text-[11px] text-text-secondary">
            {ex.rejected.map((r, i) => <li key={`r${i}`}><b className="text-rose">{r.currency ?? "?"} {r.event ?? ""}</b> — <span className="text-text-muted">{r.reason}</span></li>)}
            {ex.values_discarded.map((d, i) => <li key={`v${i}`}><b className="text-amber">{d.currency} {d.event}</b> · {d.field} “{d.value}” — <span className="text-text-muted">{d.reason}</span></li>)}
          </ul>
        ) : <p className="text-xs text-text-muted">Nada foi rejeitado.</p>}
      </Block>

      <Block n={7} title="Score individual por moeda — “Por que este score?”">
        <div className="space-y-2">
          {[...ranked, ...insufficient].map((c) => (
            <details key={c.currency} className="rounded-lg border border-border px-3 py-2">
              <summary className="text-xs cursor-pointer flex flex-wrap gap-x-3">
                <b className="text-text-primary">{c.currency}</b>
                <span className="tabular-nums">score: {c.score === null ? <b className="text-text-muted">null (sem evidência)</b> : <b>{c.score > 0 ? "+" : ""}{c.score}</b>}</span>
                <span className="text-text-muted">confiança: {c.confidence_pct === null ? "INSUFFICIENT_EVIDENCE" : `${c.confidence} · ${c.confidence_pct}%`}</span>
                <span className="text-text-muted">evidências: {c.live_events} · excluídas: {c.excluded_events?.length ?? 0}</span>
              </summary>
              <div className="mt-2 space-y-1.5">
                {c.drivers.length === 0 && <p className="text-[11px] text-text-muted">Nenhum evento mensurado — sem score.</p>}
                {c.drivers.map((d) => (
                  <div key={d.event_id} className="text-[11px] bg-surface-2 rounded px-2 py-1 space-y-0.5">
                    <p><b>{d.event}</b> → direção: <b>{d.direction ?? d.classification}</b> · regra: {d.rule_id ?? "—"} · fonte: {d.source ?? "—"}</p>
                    <p className="text-text-muted tabular-nums">atual {d.actual ?? "—"} · {d.reference_basis === "FORECAST" ? "forecast" : d.reference_basis === "PREVIOUS" ? "previous" : "referência"} {d.reference_basis === "FORECAST" ? d.forecast ?? "—" : d.previous ?? "—"} · surpresa {d.surprise == null ? "—" : d.surprise.toFixed(2)} · peso {d.weight.toFixed(3)} · impacto/score {(d.contribution ?? 0).toFixed(3)}</p>
                  </div>
                ))}
                {c.excluded_events?.map((e) => <p key={e.event_id} className="text-[11px] text-text-muted">não pontuou: {e.event} — {e.reason}</p>)}
                <p className="text-[11px] text-text-secondary">Score final: <b>{c.score ?? "null"}</b>{c.score_display != null && <> · escala −5..+5: {c.score_display}</>}</p>
              </div>
            </details>
          ))}
        </div>
      </Block>

      <Block n={8} title="Score individual × score final">
        <p className="text-xs text-text-secondary">Score final de cada moeda = média ponderada das contribuições medidas, atenuada pela massa de evidência. Moedas sem evidência ficam com <b>null</b> — nunca com 0.</p>
      </Block>

      <Block n={9} title="Ranking final">
        {ranked.length ? (
          <ol className="text-xs space-y-0.5 list-decimal list-inside">{ranked.map((c) => <li key={c.currency}><b>{c.currency}</b> {c.score! > 0 ? "+" : ""}{c.score}</li>)}</ol>
        ) : <p className="text-xs text-text-muted">Nenhuma moeda com evidência suficiente — sem ranking.</p>}
        {insufficient.length > 0 && <p className="text-[11px] text-text-muted mt-2">Sem evidência suficiente (fora do ranking): {insufficient.map((c) => c.currency).join(", ")}</p>}
      </Block>

      <Block n={10} title="Checagens de consistência">
        <ul className="space-y-1">{(audit?.checks ?? []).map((c) => (
          <li key={c.id} className="text-[11px] flex gap-2"><span className={c.passed ? "text-emerald font-bold" : "text-rose font-bold"}>{c.passed ? "OK" : "FALHOU"}</span><span className="text-text-secondary">{c.label}</span><span className="text-text-muted">— {c.detail}</span></li>
        ))}</ul>
      </Block>
    </div>
  );
}
