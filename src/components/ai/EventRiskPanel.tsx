"use client";
import type { MacroAnalysisResult, PendingEventView } from "@/lib/ai/types";
import { Badge, riskColor } from "./ui";

const fmtIn = (m: number) => (m < 0 ? "agora" : m < 60 ? `${m} min` : m < 48 * 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} d`);
const fmtAt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function EventRiskPanel({ eventRisk, pending, pairsToAvoid, calendarStatus }: { eventRisk: MacroAnalysisResult["event_risk"]; pending: PendingEventView[]; pairsToAvoid?: { symbol: string; reason: string }[]; calendarStatus?: MacroAnalysisResult["calendar_status"] }) {
  const calendarProvided = calendarStatus === "PROVIDED" || (calendarStatus == null && pending.length > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="text-xs font-extrabold text-text-primary mb-2">Risco por moeda (janela intraday: próximas 4h)</h4>
        <p className="text-[10px] text-text-muted mb-2">O risco é calculado somente com os eventos pendentes informados nesta análise; lista vazia não garante que o calendário completo não tenha eventos.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {eventRisk.map((r) => (
            <div key={r.currency} className={`rounded-xl border p-2.5 ${riskColor(calendarProvided ? r.level : "NOT_ASSESSED")}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-extrabold">{r.currency}</span><span className="text-[10px] font-extrabold">{calendarProvided ? r.level : "NÃO AVALIADO"}</span></div>
              <p className="text-[10px] opacity-80 mt-0.5">viés macro {r.current_bias}</p>
              {r.events.slice(0, 2).map((e) => <p key={e.id} className="text-[10px] mt-1 truncate" title={e.event}>• {e.event} <b>{fmtIn(e.minutes_until)}</b></p>)}
            </div>
          ))}
        </div>
        {pairsToAvoid && pairsToAvoid.length > 0 && (
          <div className="mt-3">
            <h4 className="text-xs font-extrabold text-text-primary mb-1.5">Pares a evitar</h4>
            <ul className="space-y-1">{pairsToAvoid.map((p) => <li key={p.symbol} className="text-[11px] text-text-secondary"><Badge className="bg-rose/15 text-rose border-rose/40 mr-1.5">{p.symbol}</Badge>{p.reason}</li>)}</ul>
          </div>
        )}
      </div>
      <div>
        <h4 className="text-xs font-extrabold text-text-primary mb-2">Eventos pendentes ({pending.length})</h4>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
          <table className="w-full text-[11px]">
            <tbody>
              {pending.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 font-extrabold text-text-primary">{e.currency}</td>
                  <td className="px-2 py-1.5"><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${e.impact === "high" ? "bg-rose" : e.impact === "medium" ? "bg-amber" : "bg-text-muted"}`} />{e.event}</td>
                  <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">{fmtAt(e.scheduled_at)}</td>
                  <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">em {fmtIn(e.minutes_until)}</td>
                  <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">F {e.forecast ?? "—"} · P {e.previous ?? "—"}</td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td className="px-3 py-4 text-center text-text-muted">{calendarProvided ? "Nenhum evento pendente registrado nas próximas 72h; confirme se a agenda da janela foi enviada." : "Calendário não informado nesta análise; risco de eventos não avaliado."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
