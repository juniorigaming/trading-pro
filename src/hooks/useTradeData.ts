"use client";
import { useState, useEffect, useCallback } from "react";
import { Trade, Config } from "@/lib/types";

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trades?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar operações");
      const data = await res.json();
      setTrades(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Remove uma operação da lista em memória imediatamente, sem depender do
  // servidor/cache — faz a tela refletir a exclusão na hora (sem F5).
  const removeTrade = useCallback((id: number) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { trades, loading, error, refetch, removeTrade };
}

const CONFIG_NUMERIC_KEYS = [
  "initialCapital",
  "riskPerTrade",
  "riskPercent",
  "dailyGoal",
  "dailyLossLimit",
  "maxDrawdown",
  "totalDeposits",
  "totalWithdrawals",
  "weeklyRiskLimit",
  "monthlyDrawdownLimit",
  "maxOpenRisk",
  "maxCorrelatedExposure",
  "maxTradesPerDay",
  "sampleSizeWarning",
  "sampleSizeLow",
] as const;

const CONFIG_DEFAULTS: Record<(typeof CONFIG_NUMERIC_KEYS)[number], number> = {
  initialCapital: 10000,
  riskPerTrade: 250,
  riskPercent: 2.5,
  dailyGoal: 500,
  dailyLossLimit: 350,
  maxDrawdown: 15,
  totalDeposits: 0,
  totalWithdrawals: 0,
  weeklyRiskLimit: 5,
  monthlyDrawdownLimit: 10,
  maxOpenRisk: 2,
  maxCorrelatedExposure: 3,
  maxTradesPerDay: 5,
  sampleSizeWarning: 30,
  sampleSizeLow: 10,
};

function coerceConfig(data: Config): Config {
  const out: Record<string, unknown> = { ...data };
  for (const key of CONFIG_NUMERIC_KEYS) {
    const num = Number(out[key]);
    out[key] = Number.isFinite(num) ? num : CONFIG_DEFAULTS[key];
  }
  return out as unknown as Config;
}

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfig(coerceConfig(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const save = useCallback(async (partial: Partial<Config>) => {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    const coerced = coerceConfig(data);
    setConfig(coerced);
    return coerced;
  }, []);

  return { config, loading, refetch, save };
}
