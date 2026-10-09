"use client";
import type { MacroAnalysisResult, PendingEventView } from "@/lib/ai/types";
import { Badge, riskColor } from "./ui";

const fmtIn = (m: number) => (m < 0 ? "agora" : m < 60 ? `${m} min` : m < 48 * 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} d`);
const fmtAt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function EventRiskPanel({ eventRisk, pending, pairsToAvoid }: { eventRisk: MacroAnalysisResult["event_risk"]; pending: PendingEventView[]; pairsToAvoid?: { symbol: string; reason: string }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="text-xs font-extrabold text-text-primary mb-2">Risco por moeda (próximas 4h intraday / 14h overnight)</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {eventRisk.map((r) => (
            <div key={r.currency} className={`rounded-xl border p-2.5 ${riskColor(r.level)}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-extrabold">{r.currency}</span><span className="text-[10px] font-extrabold">{r.level}</span></div>
              <p className="text-[10px] opacity-80 mt-0.5">viés {r.current_bias}</p>
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
              {pending.length === 0 && <tr><td className="px-3 py-4 text-center text-text-muted">Nenhum evento pendente nas próximas 72h (ou calendário não enviado).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
