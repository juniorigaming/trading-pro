"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_PORTFOLIO,
  PORTFOLIO_EVENT,
  PORTFOLIO_META,
  PORTFOLIO_STORAGE_KEY,
  normalizePortfolio,
  readStoredPortfolio,
  writeStoredPortfolio,
  type PortfolioId,
  type PortfolioMeta,
} from "@/lib/portfolio";
import { setDisplayCurrency } from "@/lib/utils";

interface PortfolioContextValue {
  portfolio: PortfolioId;
  meta: PortfolioMeta;
  setPortfolio: (p: PortfolioId) => void;
  /** true depois que o valor salvo no navegador foi lido (evita piscar FOREX → B3) */
  ready: boolean;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolioState] = useState<PortfolioId>(DEFAULT_PORTFOLIO);
  const [ready, setReady] = useState(false);

  // Lê o localStorage após montar (SSR sempre renderiza FOREX) e escuta trocas feitas em outros componentes/abas.
  useEffect(() => {
    const apply = (p: PortfolioId) => {
      setDisplayCurrency(PORTFOLIO_META[p].currency);
      setPortfolioState(p);
    };
    Promise.resolve().then(() => {
      apply(readStoredPortfolio());
      setReady(true);
    });
    const onLocal = (e: Event) => apply(normalizePortfolio((e as CustomEvent).detail));
    const onStorage = (e: StorageEvent) => {
      if (e.key === PORTFOLIO_STORAGE_KEY) apply(normalizePortfolio(e.newValue));
    };
    window.addEventListener(PORTFOLIO_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PORTFOLIO_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPortfolio = useCallback((p: PortfolioId) => {
    const next = normalizePortfolio(p);
    setDisplayCurrency(PORTFOLIO_META[next].currency);
    setPortfolioState(next);
    writeStoredPortfolio(next);
  }, []);

  const value = useMemo<PortfolioContextValue>(
    () => ({ portfolio, meta: PORTFOLIO_META[portfolio], setPortfolio, ready }),
    [portfolio, setPortfolio, ready],
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

/** Carteira ativa. Funciona mesmo fora do Provider (ex.: testes) usando o valor salvo no navegador. */
export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  const [fallback, setFallback] = useState<PortfolioId>(DEFAULT_PORTFOLIO);
  useEffect(() => {
    if (ctx) return;
    Promise.resolve().then(() => setFallback(readStoredPortfolio()));
    const onLocal = (e: Event) => setFallback(normalizePortfolio((e as CustomEvent).detail));
    window.addEventListener(PORTFOLIO_EVENT, onLocal);
    return () => window.removeEventListener(PORTFOLIO_EVENT, onLocal);
  }, [ctx]);
  if (ctx) return ctx;
  return {
    portfolio: fallback,
    meta: PORTFOLIO_META[fallback],
    setPortfolio: (p) => {
      setFallback(normalizePortfolio(p));
      writeStoredPortfolio(normalizePortfolio(p));
    },
    ready: true,
  };
}
