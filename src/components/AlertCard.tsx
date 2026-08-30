"use client";
import { Lightbulb, CheckCircle2, AlertTriangle } from "lucide-react";
import { Metrics } from "@/lib/calculations";
import { Config } from "@/lib/types";

interface DisciplineStats {
  followedPlan: number;
  notFollowedPlan: number;
  followedPercent: number;
  notFollowedPercent: number;
  earlyEntry: number;
  earlyExit: number;
  revengeTrade: number;
  fomo: number;
  overtrading: number;
}

interface Props {
  metrics: Metrics;
  config: Config | null;
  discipline: DisciplineStats;
}

interface Alert {
  type: "warning" | "success" | "danger";
  message: string;
}

export default function AlertCard({ metrics, config, discipline }: Props) {
  const alerts: Alert[] = [];
  const maxDD = config?.maxDrawdown ?? 15;

  if (metrics.totalTrades === 0) {
    alerts.push({ type: "success", message: "Nenhuma operação registrada ainda. Cadastre sua primeira operação para começar a acompanhar sua performance." });
  } else {
    const ddRatio = maxDD > 0 ? (metrics.currentDrawdown / maxDD) * 100 : 0;
    if (ddRatio >= 80) {
      alerts.push({ type: "danger", message: `Você atingiu ${Math.round(ddRatio)}% do limite de drawdown configurado (${maxDD}%).` });
    } else if (ddRatio >= 50) {
      alerts.push({ type: "warning", message: `Você atingiu ${Math.round(ddRatio)}% do limite de drawdown configurado.` });
    }

    if (metrics.currentLossSequence >= 3) {
      alerts.push({ type: "danger", message: `${metrics.currentLossSequence} perdas consecutivas. Considere pausar e revisar sua estratégia.` });
    }

    if (metrics.netResult > 0 && metrics.winRate >= 60) {
      alerts.push({ type: "success", message: "Performance consistente: Win Rate acima de 60% com resultado positivo." });
    }

    if (discipline.notFollowedPercent > 30) {
      alerts.push({ type: "warning", message: `${Math.round(discipline.notFollowedPercent)}% das operações fugiram do plano estabelecido.` });
    }

    if (discipline.revengeTrade > 0) {
      alerts.push({ type: "warning", message: `${discipline.revengeTrade} operação(ões) identificadas como revenge trade.` });
    }

    if (alerts.length === 0) {
      alerts.push({ type: "success", message: "Nenhum alerta no momento. Continue seguindo seu plano de trading." });
    }
  }

  const alert = alerts[0];
  const style =
    alert.type === "danger"
      ? { bg: "bg-rose/5", icon: "text-rose", iconBg: "bg-rose/10 border-rose/20", Icon: AlertTriangle }
      : alert.type === "warning"
        ? { bg: "bg-amber/5", icon: "text-amber", iconBg: "bg-amber/10 border-amber/20", Icon: Lightbulb }
        : { bg: "bg-emerald/5", icon: "text-emerald", iconBg: "bg-emerald/10 border-emerald/20", Icon: CheckCircle2 };

  return (
    <div className={`glass-card p-4 md:p-5 relative overflow-hidden ${style.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${style.iconBg}`}>
          <style.Icon size={18} className={style.icon} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-text-primary">Alertas Automáticos</h4>
          <p className="text-xs text-slate-muted mt-1">{alert.message}</p>
          {alerts.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {alerts.slice(1).map((a, i) => (
                <span key={i} className={`text-[10px] px-2 py-0.5 rounded border ${a.type === "danger" ? "bg-rose/10 text-rose border-rose/20" : a.type === "warning" ? "bg-amber/10 text-amber border-amber/20" : "bg-emerald/10 text-emerald border-emerald/20"}`}>
                  {a.message}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
