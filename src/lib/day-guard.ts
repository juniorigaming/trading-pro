/**
 * Regras do dia ("Hoje"): meta diária, limite de perda, máximo de operações.
 * Função pura (sem hooks) — usada no Command Center do Dashboard, no banner de
 * bloqueio de /operacoes/novo e nos testes.
 */
import type { Config } from "./types";
import type { AccountState } from "./account";

export interface DayGuard {
  /** meta diária em moeda (0 = sem meta) */
  dailyGoal: number;
  /** progresso 0..100 em relação à meta (0 quando não há meta) */
  goalProgressPct: number;
  goalReached: boolean;
  /** limite de perda diária em moeda (0 = sem limite) */
  dailyLossLimit: number;
  /** quanto do limite de perda já foi consumido 0..100 */
  lossUsedPct: number;
  lossLimitHit: boolean;
  tradesToday: number;
  maxTradesPerDay: number;
  maxTradesHit: boolean;
  /** true quando alguma regra manda PARAR de operar hoje */
  blocked: boolean;
  reasons: string[];
  /** avisos (não bloqueiam): 80% do limite consumido etc. */
  warnings: string[];
}

export function computeDayGuard(account: Pick<AccountState, "pnlDaily" | "tradesToday">, config: Config | null | undefined): DayGuard {
  const dailyGoal = Math.max(0, Number(config?.dailyGoal) || 0);
  const dailyLossLimit = Math.max(0, Number(config?.dailyLossLimit) || 0);
  const maxTradesPerDay = Math.max(0, Number(config?.maxTradesPerDay) || 0);
  const pnl = Number(account.pnlDaily) || 0;
  const tradesToday = Number(account.tradesToday) || 0;

  const goalProgressPct = dailyGoal > 0 ? Math.max(0, Math.min(100, (pnl / dailyGoal) * 100)) : 0;
  const goalReached = dailyGoal > 0 && pnl >= dailyGoal;

  const loss = pnl < 0 ? -pnl : 0;
  const lossUsedPct = dailyLossLimit > 0 ? Math.max(0, Math.min(100, (loss / dailyLossLimit) * 100)) : 0;
  const lossLimitHit = dailyLossLimit > 0 && loss >= dailyLossLimit;

  const maxTradesHit = maxTradesPerDay > 0 && tradesToday >= maxTradesPerDay;

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (lossLimitHit) reasons.push(`Limite de perda diária atingido (${fmt(loss)} de ${fmt(dailyLossLimit)})`);
  else if (dailyLossLimit > 0 && lossUsedPct >= 80) warnings.push(`${Math.round(lossUsedPct)}% do limite de perda diária consumido`);
  if (maxTradesHit) reasons.push(`Máximo de operações do dia atingido (${tradesToday}/${maxTradesPerDay})`);
  else if (maxTradesPerDay > 0 && tradesToday === maxTradesPerDay - 1) warnings.push("Última operação permitida hoje");
  if (goalReached) warnings.push("Meta diária batida — considere encerrar o dia");

  return {
    dailyGoal, goalProgressPct, goalReached,
    dailyLossLimit, lossUsedPct, lossLimitHit,
    tradesToday, maxTradesPerDay, maxTradesHit,
    blocked: reasons.length > 0, reasons, warnings,
  };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
