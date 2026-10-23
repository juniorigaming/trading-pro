"use client";
import type { MacroAnalysisResult, PendingEventView } from "@/lib/ai/types";
import { useLocalTimeZone } from "@/hooks/useLocalTimeZone";
import { Badge, riskColor } from "./ui";
import MarketSymbol, { CurrencyMark } from "@/components/MarketSymbol";

type RiskHours = { intraday: number; overnight: number };

const fmtIn = (m: number) => (!Number.isFinite(m) ? "não informado" : m < 0 ? "agora" : m < 60 ? `${m} min` : m < 48 * 60 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} d`);
function fmtAt(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "não informado";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone,
    }).format(date);
  } catch {
    return "não informado";
  }
}

export default function EventRiskPanel({
  eventRisk,
  pending,
  pairsToAvoid,
  eventRiskHours,
  createdAt,
}: {
  eventRisk: MacroAnalysisResult["event_risk"];
  pending: PendingEventView[] | null | undefined;
  pairsToAvoid?: { symbol: string; reason: string }[];
  eventRiskHours?: RiskHours | null;
  createdAt?: string | null;
}) {
  const timeZone = useLocalTimeZone();

  const pendingEvents = Array.isArray(pending) ? pending : [];
  const hasEventSnapshot = Array.isArray(pending);
  const riskRows = Array.isArray(eventRisk) ? eventRisk : [];
  const updatedAt = createdAt ? fmtAt(createdAt, timeZone) : "não registrado no snapshot";

  return (
    <div>
      <div className="mb-4 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-[10px] leading-relaxed text-text-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span><b className="text-text-secondary">Escopo:</b> G8 — USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD.</span>
          <span><b className="text-text-secondary">Janela por moeda:</b> {eventRiskHours ? `${eventRiskHours.intraday}h (intraday)` : "não registrada nesta análise"}.</span>
          <span><b className="text-text-secondary">Janela de pares:</b> {eventRiskHours ? `${eventRiskHours.overnight}h (overnight)` : "não registrada nesta análise"}.</span>
          <span><b className="text-text-secondary">Fuso exibido:</b> {timeZone}.</span>
          <span><b className="text-text-secondary">Atualização do snapshot:</b> {updatedAt}.</span>
          <span><b className="text-text-secondary">Eventos no snapshot:</b> {hasEventSnapshot ? `${pendingEvents.length} (lista limitada a 30 do horizonte de 72h)` : "lista não registrada"}.</span>
        </div>
        <p className="mt-1.5 text-amber/90">
          O risco considera somente eventos pendentes informados/importados para esta análise; não é um calendário completo. Lista vazia significa cobertura não confirmada — não prova que não haverá eventos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-extrabold text-text-primary mb-2">Risco por moeda</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {riskRows.map((r) => {
              const rowEvents = Array.isArray(r.events) ? r.events : [];
              const assessed = pendingEvents.some((e) => e.currency === r.currency) || rowEvents.length > 0;
              return (
                <div key={r.currency} className={`rounded-xl border p-2.5 ${assessed ? riskColor(r.level) : "border-border bg-surface-2/60 text-text-muted"}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-extrabold"><CurrencyMark currency={r.currency} />{r.currency}</span>
                    <span className="text-[9px] font-extrabold">{assessed ? r.level : "N/D"}</span>
                  </div>
                  <p className="text-[10px] opacity-80 mt-0.5">viés {r.current_bias}</p>
                  {rowEvents.slice(0, 2).map((e) => <p key={e.id} className="text-[10px] mt-1 truncate" title={e.event}>• {e.event} <b>{fmtIn(e.minutes_until)}</b></p>)}
                  {!assessed && <p className="text-[9px] mt-1">cobertura ausente</p>}
                </div>
              );
            })}
            {riskRows.length === 0 && <p className="col-span-2 text-xs text-text-muted">Risco por moeda não registrado neste snapshot.</p>}
          </div>
          {pairsToAvoid && pairsToAvoid.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-extrabold text-text-primary mb-1.5">Pares a evitar</h4>
              <ul className="space-y-1">
                {pairsToAvoid.map((p) => (
                  <li key={p.symbol} className="text-[11px] text-text-secondary flex items-start gap-1.5">
                    <Badge className="bg-rose/15 text-rose border-rose/40 inline-flex items-center gap-1.5"><MarketSymbol symbol={p.symbol} size="sm" />{p.symbol}</Badge>
                    <span>{p.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-extrabold text-text-primary mb-2">Eventos pendentes informados ({pendingEvents.length})</h4>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-[11px]">
              <tbody>
                {pendingEvents.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 font-extrabold text-text-primary"><span className="inline-flex items-center gap-1.5"><CurrencyMark currency={e.currency} />{e.currency}</span></td>
                    <td className="px-2 py-1.5"><span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${e.impact === "high" ? "bg-rose" : e.impact === "medium" ? "bg-amber" : "bg-text-muted"}`} />{e.event}</td>
                    <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">{fmtAt(e.scheduled_at, timeZone)}</td>
                    <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">em {fmtIn(e.minutes_until)}</td>
                    <td className="px-2 py-1.5 text-text-muted whitespace-nowrap">F {e.forecast ?? "—"} · P {e.previous ?? "—"}</td>
                  </tr>
                ))}
                {pendingEvents.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-text-muted">
                    {!hasEventSnapshot
                      ? "A lista de eventos não está registrada neste snapshot; cobertura não verificável."
                      : "Nenhum evento pendente foi informado neste snapshot. Isso não confirma uma agenda vazia."
                    }
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
