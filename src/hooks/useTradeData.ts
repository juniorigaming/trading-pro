"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Trade, Config } from "@/lib/types";

// Cache em memória para navegação instantânea entre abas
let tradesCache: Trade[] | null = null;
let tradesCacheTime = 0;
const CACHE_TTL = 30 * 1000; // 30 segundos - navegação entre abas fica instantânea

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>(() => {
    // Se tem cache recente, usa imediatamente - fica rápido
    if (tradesCache && Date.now() - tradesCacheTime < CACHE_TTL) {
      return tradesCache;
    }
    return [];
  });
  const [loading, setLoading] = useState(!tradesCache);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const refetch = useCallback(async (force = false) => {
    // Evita fetch duplicado se já está buscando
    if (fetchingRef.current && !force) return;
    
    // Se tem cache válido e não é force, não busca
    if (!force && tradesCache && Date.now() - tradesCacheTime < CACHE_TTL) {
      setTrades(tradesCache);
      setLoading(false);
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    try {
      const start = Date.now();
      const res = await fetch(`/api/trades?limit=100&t=${Date.now()}`, { 
        cache: "no-store",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      const duration = Date.now() - start;
      console.log(`[useTrades] Loaded ${data.length} trades in ${duration}ms`);
      
      tradesCache = data;
      tradesCacheTime = Date.now();
      setTrades(data);
      setError(null);
    } catch (e) {
      console.error("[useTrades] error:", e);
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const removeTrade = useCallback((id: number) => {
    setTrades((prev) => {
      const next = prev.filter((t) => t.id !== id);
      tradesCache = next;
      tradesCacheTime = Date.now();
      return next;
    });
  }, []);

  const addTrade = useCallback((newTrade: Trade) => {
    setTrades((prev) => {
      const next = [newTrade, ...prev];
      tradesCache = next;
      tradesCacheTime = Date.now();
      return next;
    });
  }, []);

  useEffect(() => {
    // Só busca se não tem cache
    if (!tradesCache || Date.now() - tradesCacheTime > CACHE_TTL) {
      refetch();
    }
  }, [refetch]);

  return { trades, loading, error, refetch, removeTrade, addTrade };
}

// Config com cache também
let configCache: Config | null = null;
let configCacheTime = 0;

function coerceConfig(data: Config): Config {
  return data;
}

export function useConfig() {
  const [config, setConfig] = useState<Config | null>(() => configCache);
  const [loading, setLoading] = useState(!configCache);

  const refetch = useCallback(async () => {
    if (configCache && Date.now() - configCacheTime < 60000) {
      setConfig(configCache);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/config?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      configCache = data;
      configCacheTime = Date.now();
      setConfig(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configCache) refetch();
  }, [refetch]);

  const save = useCallback(async (partial: Partial<Config>) => {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = await res.json();
    configCache = data;
    configCacheTime = Date.now();
    setConfig(data);
    return data;
  }, []);

  return { config, loading, refetch, save };
}
