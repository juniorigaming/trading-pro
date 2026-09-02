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
      // FIX: Adiciona limit e timestamp para evitar cache e 1102
      // Antes sem limit, retornava tudo com base64 gigante
      const res = await fetch(`/api/trades?limit=200&t=${Date.now()}`, { 
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Falha ao carregar operações (${res.status})`);
      }
      const data = await res.json();
      setTrades(data);
      setError(null);
    } catch (e) {
      console.error("[useTrades] refetch error:", e);
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  // Remove da lista em memória imediatamente - FIX bug de exclusão
  const removeTrade = useCallback((id: number) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Adiciona trade na lista imediatamente - FIX bug de cadastro não aparecendo
  const addTrade = useCallback((newTrade: Trade) => {
    setTrades((prev) => [newTrade, ...prev]);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { trades, loading, error, refetch, removeTrade, addTrade };
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
      const res = await fetch(`/api/config?t=${Date.now()}`, { cache: "no-store" });
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
