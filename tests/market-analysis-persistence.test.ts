import { describe, expect, it } from "vitest";
import { macroEventsForPersistence } from "@/lib/macro/market-analysis-persistence";
import type { MacroEvidenceEvent, MacroEvidenceSnapshot } from "@/lib/macro/market-analysis-types";

function event(overrides: Partial<MacroEvidenceEvent> = {}): MacroEvidenceEvent {
  return {
    id: "e1", currency: "USD", event: "Core CPI", date: "2026-01-15", scheduledAt: "2026-01-15T13:30:00.000Z",
    impact: "high", actual: "0.3%", forecast: "0.2%", previous: "0.2%", source: "manual",
    kind: "released", origin: "saved_database", interpretation: null, ...overrides,
  };
}

function evidence(released: MacroEvidenceEvent[], upcoming: MacroEvidenceEvent[] = []): MacroEvidenceSnapshot {
  return {
    status: "available", retrievedAt: "2026-01-15T14:00:00.000Z", released, upcoming,
    supplementalCount: 0, excludedUnconfirmedCount: 0, message: null,
  };
}

describe("macroEventsForPersistence", () => {
  it("preserva o instante UTC dos eventos já salvos", () => {
    const rows = macroEventsForPersistence(evidence([event()]), -180);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-01-15", time: "13:30", currency: "USD", actual: "0.3%", forecast: "0.2%" });
  });

  it("converte horário local de evento confirmado para UTC sem deslocar o dado salvo", () => {
    const rows = macroEventsForPersistence(evidence([event({
      id: "input:1", date: "2026-01-15", scheduledAt: "2026-01-15 10:30", origin: "user_confirmed",
    })]), -180);
    expect(rows[0]).toMatchObject({ date: "2026-01-15", time: "13:30", requires_manual_confirmation: false });
  });

  it("mantém eventos futuros como pendentes e elimina duplicatas", () => {
    const upcoming = event({ id: "e2", kind: "upcoming", actual: null, scheduledAt: "2026-01-15T15:00:00.000Z" });
    const rows = macroEventsForPersistence(evidence([event(), event()], [upcoming]), 0);
    expect(rows).toHaveLength(2);
    expect(rows[1].actual).toBeNull();
  });

  it("não salva moedas fora do G8 nem eventos sem data válida", () => {
    const rows = macroEventsForPersistence(evidence([
      event({ currency: "BRL" as MacroEvidenceEvent["currency"] }),
      event({ id: "bad", date: "2026-02-31", scheduledAt: "2026-02-31 12:00", origin: "user_confirmed" }),
    ]), -180);
    expect(rows).toEqual([]);
  });
});
