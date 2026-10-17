import { describe, expect, it } from "vitest";
import { computeDayGuard } from "@/lib/day-guard";
import { DEFAULT_CONFIG } from "@/lib/config";

describe("day guard — avisos comportamentais", () => {
  it("bloqueia por perda diária atingida e informa o motivo", () => {
    const config = { ...DEFAULT_CONFIG, dailyLossLimit: 350, maxTradesPerDay: 5 };
    const result = computeDayGuard({ pnlDaily: -350, tradesToday: 2 }, config);
    expect(result.blocked).toBe(true);
    expect(result.lossLimitHit).toBe(true);
    expect(result.reasons[0]).toContain("Limite de perda diária");
  });

  it("bloqueia no número máximo de operações executadas", () => {
    const result = computeDayGuard({ pnlDaily: 20, tradesToday: 5 }, { ...DEFAULT_CONFIG, maxTradesPerDay: 5 });
    expect(result.blocked).toBe(true);
    expect(result.maxTradesHit).toBe(true);
    expect(result.reasons.join(" ")).toContain("5/5");
  });

  it("avisa perto do limite e ao atingir a meta sem bloquear a gravação", () => {
    const config = { ...DEFAULT_CONFIG, dailyGoal: 500, dailyLossLimit: 350, maxTradesPerDay: 5 };
    const nearLoss = computeDayGuard({ pnlDaily: -280, tradesToday: 4 }, config);
    expect(nearLoss.blocked).toBe(false);
    expect(nearLoss.warnings).toContain("80% do limite de perda diária consumido");
    expect(nearLoss.warnings).toContain("Última operação permitida hoje");

    const goal = computeDayGuard({ pnlDaily: 500, tradesToday: 1 }, config);
    expect(goal.goalReached).toBe(true);
    expect(goal.goalProgressPct).toBe(100);
    expect(goal.blocked).toBe(false);
    expect(goal.warnings).toContain("Meta diária batida — considere encerrar o dia");
  });

  it("trata zero como regra desativada", () => {
    const result = computeDayGuard({ pnlDaily: -10000, tradesToday: 100 }, { ...DEFAULT_CONFIG, dailyLossLimit: 0, maxTradesPerDay: 0, dailyGoal: 0 });
    expect(result.blocked).toBe(false);
    expect(result.goalProgressPct).toBe(0);
  });
});
