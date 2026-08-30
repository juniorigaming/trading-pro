import { Trade } from "./types";

export interface GroupStat {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  result: number;
  avgR: number;
  profitFactor: number;
}

function buildGroupStats(trades: Trade[], keyFn: (t: Trade) => string): GroupStat[] {
  const map = new Map<string, Trade[]>();
  trades.forEach((t) => {
    const key = keyFn(t) || "Não definido";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  });

  return Array.from(map.entries())
    .map(([key, group]) => {
      const wins = group.filter((t) => t.resultType === "WIN");
      const losses = group.filter((t) => t.resultType === "LOSS");
      const be = group.filter((t) => t.resultType === "BREAK EVEN");
      const grossProfit = wins.reduce((s, t) => s + (t.resultAmount || 0), 0);
      const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.resultAmount || 0), 0));
      const result = group.reduce((s, t) => s + (t.resultAmount || 0), 0);
      const winRate = wins.length + losses.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0;
      const avgR = group.length > 0 ? group.reduce((s, t) => s + (t.resultR || 0), 0) / group.length : 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
      return { key, trades: group.length, wins: wins.length, losses: losses.length, breakEven: be.length, winRate, result, avgR, profitFactor };
    })
    .sort((a, b) => b.result - a.result);
}

export function groupByAsset(trades: Trade[]) {
  return buildGroupStats(trades, (t) => t.asset);
}

export function groupBySession(trades: Trade[]) {
  return buildGroupStats(trades, (t) => t.session);
}

export function groupBySetup(trades: Trade[]) {
  return buildGroupStats(trades, (t) => t.setup || "Sem setup");
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function groupByWeekday(trades: Trade[]) {
  const stats = buildGroupStats(trades, (t) => WEEKDAYS[new Date(t.date).getUTCDay()]);
  return WEEKDAYS.filter((d) => d !== "Domingo" && d !== "Sábado").map(
    (day) => stats.find((s) => s.key === day) || { key: day, trades: 0, wins: 0, losses: 0, breakEven: 0, winRate: 0, result: 0, avgR: 0, profitFactor: 0 }
  );
}

export function groupByHour(trades: Trade[]) {
  const stats = buildGroupStats(trades, (t) => (t.time || "00:00").split(":")[0] + ":00");
  return stats.sort((a, b) => a.key.localeCompare(b.key));
}

export interface DayResult {
  date: string;
  result: number;
  trades: number;
  wins: number;
  losses: number;
  breakEven: number;
  resultR: number;
  assets: string[];
  avgExecutionScore: number | null;
  planAdherence: number | null;
}

export function buildCalendarData(trades: Trade[]): Map<string, DayResult> {
  const map = new Map<string, DayResult>();
  trades.forEach((t) => {
    const key = new Date(t.date).toISOString().split("T")[0];
    if (!map.has(key)) {
      map.set(key, { date: key, result: 0, trades: 0, wins: 0, losses: 0, breakEven: 0, resultR: 0, assets: [], avgExecutionScore: null, planAdherence: null });
    }
    const entry = map.get(key)!;
    entry.result += t.resultAmount || 0;
    entry.trades += 1;
    entry.resultR += t.resultR || 0;
    if (t.resultType === "WIN") entry.wins += 1;
    else if (t.resultType === "LOSS") entry.losses += 1;
    else entry.breakEven += 1;
    if (!entry.assets.includes(t.asset)) entry.assets.push(t.asset);
    if (t.executionScore != null) {
      entry.avgExecutionScore = entry.avgExecutionScore == null ? t.executionScore : Math.round((entry.avgExecutionScore + t.executionScore) / 2);
    }
    if (t.followedPlan !== undefined) {
      entry.planAdherence = entry.planAdherence == null ? (t.followedPlan ? 100 : 0) : Math.round((entry.planAdherence + (t.followedPlan ? 100 : 0)) / 2);
    }
  });
  return map;
}

export function rDistribution(trades: Trade[]) {
  const values = trades.map((t) => t.resultR || 0).filter((v) => v !== undefined);
  if (values.length === 0) return { avg: 0, median: 0, max: 0, min: 0, total: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    median,
    max: Math.max(...values),
    min: Math.min(...values),
    total: values.reduce((a, b) => a + b, 0),
  };
}

export function disciplineStats(trades: Trade[]) {
  const total = trades.length || 1;
  const followed = trades.filter((t) => t.followedPlan).length;
  const notFollowed = trades.length - followed;
  return {
    followedPlan: followed,
    notFollowedPlan: notFollowed,
    followedPercent: (followed / total) * 100,
    notFollowedPercent: (notFollowed / total) * 100,
    earlyEntry: trades.filter((t) => t.earlyEntry).length,
    earlyExit: trades.filter((t) => t.earlyExit).length,
    revengeTrade: trades.filter((t) => t.revengeTrade).length,
    fomo: trades.filter((t) => t.fomo).length,
    overtrading: trades.filter((t) => t.overtrading).length,
  };
}

export interface Metrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number;
  lossRate: number;
  grossProfit: number;
  grossLoss: number;
  netResult: number;
  profitFactor: number;
  payoffRatio: number;
  avgWin: number;
  avgLoss: number;
  avgR: number;
  avgWinR: number;
  avgLossR: number;
  maxWin: number;
  maxLoss: number;
  maxWinSequence: number;
  maxLossSequence: number;
  currentWinSequence: number;
  currentLossSequence: number;
  maxDrawdown: number;
  currentDrawdown: number;
  expectancy: number;
  tradesPerDay: number;
  bestDay: { date: string; result: number };
  worstDay: { date: string; result: number };
  bestAsset: { asset: string; result: number; trades: number };
  worstAsset: { asset: string; result: number; trades: number };
  bestSetup: { setup: string; result: number; trades: number };
  worstSetup: { setup: string; result: number; trades: number };
  initialCapital: number;
  currentCapital: number;
  growthPercent: number;
}

export function calculateMetrics(trades: Trade[], initialCapital: number = 10000): Metrics {
  const wins = trades.filter((t) => t.resultType === "WIN");
  const losses = trades.filter((t) => t.resultType === "LOSS");
  const be = trades.filter((t) => t.resultType === "BREAK EVEN");

  const winCount = wins.length;
  const lossCount = losses.length;
  const beCount = be.length;
  const total = trades.length;

  const grossProfit = wins.reduce((sum, t) => sum + (t.resultAmount || 0), 0);
  const grossLoss = losses.reduce((sum, t) => sum + Math.abs(t.resultAmount || 0), 0);
  const netResult = trades.reduce((sum, t) => sum + (t.resultAmount || 0), 0);

  const winRate = winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
  const lossRate = winCount + lossCount > 0 ? (lossCount / (winCount + lossCount)) * 100 : 0;

  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  const avgWinR = winCount > 0 ? wins.reduce((s, t) => s + (t.resultR || 0), 0) / winCount : 0;
  const avgLossR = lossCount > 0 ? losses.reduce((s, t) => s + Math.abs(t.resultR || 0), 0) / lossCount : 0;
  const avgR = total > 0 ? trades.reduce((s, t) => s + (t.resultR || 0), 0) / total : 0;

  const maxWin = Math.max(0, ...trades.map((t) => t.resultAmount || 0));
  const maxLoss = Math.min(0, ...trades.map((t) => t.resultAmount || 0));
  const maxLossAbs = Math.abs(maxLoss);

  // Sequence calculation
  let maxWinSeq = 0;
  let maxLossSeq = 0;
  let currWinSeq = 0;
  let currLossSeq = 0;
  let tempWinSeq = 0;
  let tempLossSeq = 0;

  for (const t of trades) {
    if (t.resultType === "WIN") {
      tempWinSeq++;
      tempLossSeq = 0;
      maxWinSeq = Math.max(maxWinSeq, tempWinSeq);
    } else if (t.resultType === "LOSS") {
      tempLossSeq++;
      tempWinSeq = 0;
      maxLossSeq = Math.max(maxLossSeq, tempLossSeq);
    } else {
      tempWinSeq = 0;
      tempLossSeq = 0;
    }
  }
  // Current sequences: from end
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].resultType === "WIN") {
      currWinSeq++;
      currLossSeq = 0;
    } else if (trades[i].resultType === "LOSS") {
      currLossSeq++;
      currWinSeq = 0;
    } else {
      break;
    }
  }

  // Drawdown
  let peak = initialCapital;
  let currentCap = initialCapital;
  let maxDD = 0;
  let currentDD = 0;
  let runningCap = initialCapital;

  for (const t of trades) {
    runningCap += t.resultAmount || 0;
    if (runningCap > peak) peak = runningCap;
    const dd = peak > 0 ? ((peak - runningCap) / peak) * 100 : 0;
    maxDD = Math.max(maxDD, dd);
  }
  currentCap = runningCap;
  currentDD = peak > 0 ? ((peak - currentCap) / peak) * 100 : 0;

  // Expectancy
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  // Per day
  const dayResults = new Map<string, number>();
  trades.forEach((t) => {
    const d = new Date(t.date).toISOString().split("T")[0];
    dayResults.set(d, (dayResults.get(d) || 0) + (t.resultAmount || 0));
  });
  const tradesPerDay = trades.length / Math.max(dayResults.size, 1);
  const bestDay = Array.from(dayResults.entries()).reduce(
    (best, [d, r]) => (r > best.result ? { date: d, result: r } : best),
    { date: "", result: -Infinity }
  );
  const worstDay = Array.from(dayResults.entries()).reduce(
    (worst, [d, r]) => (r < worst.result ? { date: d, result: r } : worst),
    { date: "", result: Infinity }
  );

  // Per asset
  const assetResults = new Map<string, { result: number; trades: number }>();
  trades.forEach((t) => {
    const existing = assetResults.get(t.asset) || { result: 0, trades: 0 };
    assetResults.set(t.asset, { result: existing.result + (t.resultAmount || 0), trades: existing.trades + 1 });
  });
  const bestAsset = Array.from(assetResults.entries()).reduce(
    (best, [a, v]) => (v.result > best.result ? { asset: a, result: v.result, trades: v.trades } : best),
    { asset: "", result: -Infinity, trades: 0 }
  );
  const worstAsset = Array.from(assetResults.entries()).reduce(
    (worst, [a, v]) => (v.result < worst.result ? { asset: a, result: v.result, trades: v.trades } : worst),
    { asset: "", result: Infinity, trades: 0 }
  );

  // Per setup
  const setupResults = new Map<string, { result: number; trades: number }>();
  trades.forEach((t) => {
    const s = t.setup || "Sem setup";
    const existing = setupResults.get(s) || { result: 0, trades: 0 };
    setupResults.set(s, { result: existing.result + (t.resultAmount || 0), trades: existing.trades + 1 });
  });
  const bestSetup = Array.from(setupResults.entries()).reduce(
    (best, [s, v]) => (v.result > best.result ? { setup: s, result: v.result, trades: v.trades } : best),
    { setup: "", result: -Infinity, trades: 0 }
  );
  const worstSetup = Array.from(setupResults.entries()).reduce(
    (worst, [s, v]) => (v.result < worst.result ? { setup: s, result: v.result, trades: v.trades } : worst),
    { setup: "", result: Infinity, trades: 0 }
  );

  const growthPercent = initialCapital > 0 ? ((currentCap - initialCapital) / initialCapital) * 100 : 0;

  return {
    totalTrades: total,
    wins: winCount,
    losses: lossCount,
    breakEven: beCount,
    winRate,
    lossRate,
    grossProfit,
    grossLoss,
    netResult,
    profitFactor,
    payoffRatio,
    avgWin,
    avgLoss,
    avgR,
    avgWinR,
    avgLossR,
    maxWin,
    maxLoss: Math.abs(maxLoss),
    maxWinSequence: maxWinSeq,
    maxLossSequence: maxLossSeq,
    currentWinSequence: currWinSeq,
    currentLossSequence: currLossSeq,
    maxDrawdown: maxDD,
    currentDrawdown: currentDD,
    expectancy,
    tradesPerDay,
    bestDay,
    worstDay,
    bestAsset,
    worstAsset,
    bestSetup,
    worstSetup,
    initialCapital,
    currentCapital: currentCap,
    growthPercent,
  };
}
