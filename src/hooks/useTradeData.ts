"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Trade, Config } from "@/lib/types";
import { usePortfolio } from "@/components/PortfolioProvider";
import { PORTFOLIO_META, type PortfolioId } from "@/lib/portfolio";
import { setDisplayCurrency } from "@/lib/utils";

// Cache em memória POR CARTEIRA para navegação instantânea entre abas
const CACHE_TTL = 30 * 1000; // 30 segundos
const tradesCache = new Map<PortfolioId, { data: Trade[]; time: number }>();
const configCache = new Map<PortfolioId, { data: Config; time: number }>();
const PAGE_SIZE = 5000;
const MAX_TRADE_ROWS = 250_000;
// Evita 3 componentes dispararem o mesmo fetch ao montar o Dashboard.
const tradesInFlight = new Map<PortfolioId, Promise<Trade[]>>();
const tradeEpoch = new Map<PortfolioId, number>();
let tradeFetchSequence = 0;

async function fetchAllTrades(portfolio: PortfolioId): Promise<Trade[]> {
  const existing = tradesInFlight.get(portfolio);
  if (existing) return existing;

  const request = (async () => {
    const all: Trade[] = [];
    for (let offset = 0; offset <= MAX_TRADE_ROWS; offset += PAGE_SIZE) {
      const requestLimit = Math.min(PAGE_SIZE, MAX_TRADE_ROWS - all.length + 1);
      const res = await fetch(`/api/trades?portfolio=${portfolio}&limit=${requestLimit}&offset=${offset}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `Erro ${res.status}`);
      }
      const page = (await res.json()) as Trade[];
      all.push(...page);
      if (all.length > MAX_TRADE_ROWS) throw new Error(`O histórico excede ${MAX_TRADE_ROWS.toLocaleString("pt-BR")} operações; exporte/arquive períodos antigos para continuar.`);
      if (page.length < requestLimit) return all;
    }
    // Não trunca silenciosamente: mensagem explica o teto seguro do cliente.
    throw new Error(`O histórico excede ${MAX_TRADE_ROWS.toLocaleString("pt-BR")} operações; exporte/arquive períodos antigos para continuar.`);
  })();

  tradesInFlight.set(portfolio, request);
  try { return await request; }
  finally { if (tradesInFlight.get(portfolio) === request) tradesInFlight.delete(portfolio); }
}

function cachedTrades(p: PortfolioId): Trade[] | null {
  const c = tradesCache.get(p);
  return c && Date.now() - c.time < CACHE_TTL ? c.data : null;
}

/** Limpa todos os caches (após importação ou exclusão em massa). */
export function invalidateTradeCaches() {
  tradesCache.clear();
  tradesInFlight.clear();
  for (const p of ["FOREX", "B3", "CRYPTO"] as const) tradeEpoch.set(p, (tradeEpoch.get(p) ?? 0) + 1);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tradesChanged"));
}

/**
 * Operações da carteira ativa (ou da carteira passada em `override`).
 * Troca de carteira → refetch automático; cache separado por carteira.
 */
export function useTrades(override?: PortfolioId) {
  const { portfolio: active } = usePortfolio();
  const portfolio = override ?? active;
  const [trades, setTrades] = useState<Trade[]>(() => cachedTrades(portfolio) ?? []);
  const [loading, setLoading] = useState(!cachedTrades(portfolio));
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef<{ portfolio: PortfolioId; id: number } | null>(null);
  const portfolioRef = useRef(portfolio);
  useEffect(() => { portfolioRef.current = portfolio; }, [portfolio]);

  const refetch = useCallback(async (force = false) => {
    const p = portfolio;
    if (fetchingRef.current?.portfolio === p && !force) return;

    const cached = cachedTrades(p);
    if (!force && cached) {
      setTrades(cached);
      setLoading(false);
      return;
    }

    const requestId = ++tradeFetchSequence;
    const requestEpoch = tradeEpoch.get(p) ?? 0;
    fetchingRef.current = { portfolio: p, id: requestId };
    setLoading(true);
    try {
      // Busca em páginas, sem limite silencioso de 200/500 operações; requisições simultâneas por
      // componente compartilham a mesma promise/cache da carteira.
      const data = await fetchAllTrades(p);
      // Uma importação/exclusão pode invalidar um fetch já em andamento.
      if ((tradeEpoch.get(p) ?? 0) !== requestEpoch) return;
      tradesCache.set(p, { data, time: Date.now() });
      // só aplica se o usuário ainda está na mesma carteira (evita misturar respostas atrasadas)
      if (portfolioRef.current === p) {
        setTrades(data);
        setError(null);
      }
    } catch (e) {
      console.error("[useTrades] error:", e);
      if ((tradeEpoch.get(p) ?? 0) === requestEpoch && portfolioRef.current === p) setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      if (fetchingRef.current?.id === requestId) {
        fetchingRef.current = null;
        if (portfolioRef.current === p && (tradeEpoch.get(p) ?? 0) === requestEpoch) setLoading(false);
      }
    }
  }, [portfolio]);

  const removeTrade = useCallback((id: number) => {
    setTrades((prev) => {
      const next = prev.filter((t) => t.id !== id);
      tradesCache.set(portfolio, { data: next, time: Date.now() });
      return next;
    });
  }, [portfolio]);

  const addTrade = useCallback((newTrade: Trade) => {
    setTrades((prev) => {
      const next = [newTrade, ...prev];
      tradesCache.set(portfolio, { data: next, time: Date.now() });
      return next;
    });
  }, [portfolio]);

  // Troca de carteira: mostra cache (se houver) e busca
  useEffect(() => {
    const cached = cachedTrades(portfolio);
    if (cached) {
      Promise.resolve().then(() => { setTrades(cached); setLoading(false); });
    } else {
      Promise.resolve().then(() => { setTrades([]); void refetch(true); });
    }
  }, [portfolio, refetch]);

  // Importação / exclusão em massa em outro componente
  useEffect(() => {
    const onChanged = () => refetch(true);
    window.addEventListener("tradesChanged", onChanged);
    window.addEventListener("tradesCleared", onChanged);
    return () => {
      window.removeEventListener("tradesChanged", onChanged);
      window.removeEventListener("tradesCleared", onChanged);
    };
  }, [refetch]);

  return { trades, loading, error, refetch, removeTrade, addTrade, portfolio };
}

/** Configuração (capital, moeda, limites) da carteira ativa — ou de `override`. */
export function useConfig(override?: PortfolioId) {
  const { portfolio: active } = usePortfolio();
  const portfolio = override ?? active;
  const [config, setConfig] = useState<Config | null>(() => configCache.get(portfolio)?.data ?? null);
  const [loading, setLoading] = useState(!configCache.get(portfolio));
  const portfolioRef = useRef(portfolio);
  useEffect(() => { portfolioRef.current = portfolio; }, [portfolio]);

  const refetch = useCallback(async (force = false) => {
    const p = portfolio;
    const cached = configCache.get(p);
    if (!force && cached && Date.now() - cached.time < 60000) {
      setConfig(cached.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/config?portfolio=${p}&t=${Date.now()}`, { cache: "no-store" });
      const data = (await res.json()) as Config;
      configCache.set(p, { data, time: Date.now() });
      if (portfolioRef.current === p) {
        setConfig(data);
        if (!override) setDisplayCurrency(data.currency || PORTFOLIO_META[p].currency);
      }
    } finally {
      if (portfolioRef.current === p) setLoading(false);
    }
  }, [portfolio, override]);

  useEffect(() => {
    const cached = configCache.get(portfolio);
    if (cached) Promise.resolve().then(() => { setConfig(cached.data); setLoading(false); void refetch(); });
    else Promise.resolve().then(() => { setConfig(null); void refetch(); });
  }, [portfolio, refetch]);

  const save = useCallback(async (partial: Partial<Config>) => {
    const p = portfolio;
    const res = await fetch(`/api/config?portfolio=${p}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    const data = (await res.json()) as Config;
    configCache.set(p, { data, time: Date.now() });
    setConfig(data);
    if (!override) setDisplayCurrency(data.currency || PORTFOLIO_META[p].currency);
    window.dispatchEvent(new CustomEvent("configChanged", { detail: p }));
    return data;
  }, [portfolio, override]);

  return { config, loading, refetch, save, portfolio };
}

/** Resumo das 3 carteiras (saldo/moeda) para o seletor do dashboard. */
export function useAllConfigs() {
  const [configs, setConfigs] = useState<Record<PortfolioId, Config> | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/config?all=1&t=${Date.now()}`, { cache: "no-store" });
      const data = (await res.json()) as Record<PortfolioId, Config>;
      if (data && data.FOREX) {
        setConfigs(data);
        (Object.keys(data) as PortfolioId[]).forEach((p) => configCache.set(p, { data: data[p], time: Date.now() }));
      }
    } catch {
      /* mantém o que tinha */
    }
  }, []);
  useEffect(() => {
    Promise.resolve().then(load);
    const onChanged = () => load();
    window.addEventListener("configChanged", onChanged);
    return () => window.removeEventListener("configChanged", onChanged);
  }, [load]);
  return { configs, reload: load };
}
