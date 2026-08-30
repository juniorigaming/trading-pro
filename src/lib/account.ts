import { Trade } from "./types";
import { Config } from "./types";
import { buildCalendarData } from "./calculations";

export interface AccountState {
  initialBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  realizedPnl: number;
  unrealizedPnl: number;
  realizedBalance: number;
  equity: number;
  pnlDaily: number;
  pnlWeekly: number;
  rDaily: number;
  rWeekly: number;
  openRisk: number;
  riskUsedToday: number; // in currency
  riskRemaining: number; // in currency
  riskUsedTodayPercent: number;
  weeklyRiskUsedPercent: number;
  currentDrawdown: number;
  tradesToday: number;
  maxTradesPerDay: number;
}

export function computeAccount(trades: Trade[], config: Config | null): AccountState {
  const cfg = config ?? ({} as Config);
  const initialBalance = cfg.initialCapital || 10000;
  const totalDeposits = cfg.totalDeposits || 0;
  const totalWithdrawals = cfg.totalWithdrawals || 0;
  const riskPercent = cfg.riskPercent || 2.5;
  const maxTradesPerDay = cfg.maxTradesPerDay || 5;
  const weeklyRiskLimitPercent = cfg.weeklyRiskLimit || 5;
  const maxOpenRiskPercent = cfg.maxOpenRisk || 2;

  // Realized PnL from closed trades that have a result.
  const realized = trades.filter((t) => t.resultType === "WIN" || t.resultType === "LOSS" || t.resultType === "BREAK EVEN");
  const realizedPnl = realized.reduce((s, t) => s + (t.resultAmount || 0), 0);

  // Unrealized from open / planned trades (planned trades track unrealized).
  const unrealizedPnl = trades
    .filter((t) => t.status === "OPEN" || t.status === "PLANNED")
    .reduce((s, t) => s + (t.unrealizedPnl || 0), 0);

  const realizedBalance = initialBalance + totalDeposits - totalWithdrawals + realizedPnl;
  const equity = realizedBalance + unrealizedPnl;

  // Daily / weekly PnL and R.
  const calendar = buildCalendarData(trades);
  const todayKey = new Date().toISOString().split("T")[0];
  const today = calendar.get(todayKey);
  const pnlDaily = today?.result ?? 0;
  const rDaily = today?.resultR ?? 0;

  // Weekly: last 7 days.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  let pnlWeekly = 0;
  let rWeekly = 0;
  trades.forEach((t) => {
    const d = new Date(t.date);
    if (d >= weekAgo) {
      pnlWeekly += t.resultAmount || 0;
      rWeekly += t.resultR || 0;
    }
  });

  // Open risk = sum of planned/open trade risk amounts.
  const openRisk = trades
    .filter((t) => t.status === "OPEN" || t.status === "PLANNED" || t.status === "READY")
    .reduce((s, t) => s + (t.riskAmount || 0), 0);

  // Risk used today = sum of risk on today's executed trades.
  const riskUsedToday = today
    ? trades.filter((t) => new Date(t.date).toISOString().split("T")[0] === todayKey).reduce((s, t) => s + (t.riskAmount || 0), 0)
    : 0;

  const dailyRiskLimit = (riskPercent / 100) * equity * maxTradesPerDay;
  const riskRemaining = Math.max(0, dailyRiskLimit - riskUsedToday);

  const riskUsedTodayPercent = equity > 0 ? (riskUsedToday / equity) * 100 : 0;
  const weeklyRiskUsedPercent = (weeklyRiskLimitPercent / 100) * equity > 0
    ? (openRisk / ((weeklyRiskLimitPercent / 100) * equity)) * 100
    : 0;

  // Drawdown from realized balance.
  let peak = initialBalance;
  let runningCap = initialBalance;
  trades
    .filter((t) => t.resultType)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.time.localeCompare(b.time))
    .forEach((t) => {
      runningCap += t.resultAmount || 0;
      if (runningCap > peak) peak = runningCap;
    });
  const currentDrawdown = peak > 0 ? ((peak - runningCap) / peak) * 100 : 0;

  const tradesToday = trades.filter((t) => new Date(t.date).toISOString().split("T")[0] === todayKey).length;

  return {
    initialBalance,
    totalDeposits,
    totalWithdrawals,
    realizedPnl,
    unrealizedPnl,
    realizedBalance,
    equity,
    pnlDaily,
    pnlWeekly,
    rDaily,
    rWeekly,
    openRisk,
    riskUsedToday,
    riskRemaining,
    riskUsedTodayPercent,
    weeklyRiskUsedPercent,
    currentDrawdown,
    tradesToday,
    maxTradesPerDay,
  };
}
