"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Wallet, Settings2, Globe2, Landmark, Bitcoin } from "lucide-react";
import { usePortfolio } from "@/components/PortfolioProvider";
import { useAllConfigs, useTrades } from "@/hooks/useTradeData";
import { PORTFOLIOS, PORTFOLIO_META, type PortfolioId } from "@/lib/portfolio";
import { computeAccount } from "@/lib/account";
import { formatCurrency } from "@/lib/utils";
import type { Config } from "@/lib/types";

const ICONS: Record<PortfolioId, typeof Globe2> = { FOREX: Globe2, B3: Landmark, CRYPTO: Bitcoin };

/** Saldo de UMA carteira (hook isolado para poder ser renderizado 3x com carteiras diferentes). */
function WalletCard({ id, active, onSelect, compact, config }: { id: PortfolioId; active: boolean; onSelect: (p: PortfolioId) => void; compact?: boolean; config: Config | null }) {
  const meta = PORTFOLIO_META[id];
  const { trades } = useTrades(id);
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const Icon = ICONS[id];
  const pnl = account.realizedPnl;
  const base = account.initialBalance + account.totalDeposits - account.totalWithdrawals;
  const pct = base > 0 ? (pnl / base) * 100 : 0;
  const empty = trades.length === 0 && (config?.initialCapital ?? 0) === 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
      title={`${meta.label} — ${meta.description}`}
      className={`group relative text-left rounded-2xl border transition-all duration-200 ${compact ? "px-3 py-2 min-w-[150px]" : "p-4 min-w-[200px] flex-1"} ${
        active
          ? `${meta.accent.bg} ${meta.accent.border} shadow-lg ring-1 ring-inset ring-white/5`
          : "bg-surface-2/60 border-border hover:bg-surface-3 hover:border-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? `${meta.accent.bg} ${meta.accent.text}` : "bg-surface-3 text-text-muted"}`}>
            <Icon size={15} />
          </span>
          <span className="min-w-0">
            <span className={`block text-xs font-extrabold leading-tight ${active ? "text-text-primary" : "text-text-secondary"}`}>{meta.label}</span>
            <span className="block text-[10px] text-text-muted leading-tight">{meta.currency}</span>
          </span>
        </span>
        {active && <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${meta.accent.bg} ${meta.accent.text}`}>ativa</span>}
      </div>
      {!compact && (
        <div className="mt-3">
          <p className={`text-lg font-extrabold tabular-nums ${active ? "text-text-primary" : "text-text-secondary"}`}>
            {config ? formatCurrency(account.realizedBalance, config.currency || meta.currency) : "…"}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5">
            {empty ? (
              <span>Carteira zerada · {trades.length === 0 ? "sem operações" : ""}</span>
            ) : (
              <>
                <span className={pnl >= 0 ? "text-emerald font-semibold" : "text-rose font-semibold"}>
                  {pnl >= 0 ? "+" : ""}{formatCurrency(pnl, config?.currency || meta.currency)} ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
                </span>
                <span> · {trades.length} op{trades.length === 1 ? "" : "s"}</span>
              </>
            )}
          </p>
        </div>
      )}
    </button>
  );
}

/**
 * Seletor de carteira (Forex · B3 · Cripto) usado no topo do Dashboard.
 * `compact` → versão em pílulas para páginas internas.
 */
export default function PortfolioSwitcher({ compact = false }: { compact?: boolean }) {
  const { portfolio, setPortfolio, meta } = usePortfolio();
  const { configs } = useAllConfigs();

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "glass-card-strong p-4 md:p-5 mb-6"}>
      {!compact && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><Wallet size={16} className="text-accent" /></div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">Carteiras</h2>
              <p className="text-[11px] text-text-muted">Selecione o mercado — todo o painel passa a mostrar só essa carteira</p>
            </div>
          </div>
          <Link href="/configuracoes#carteira" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface-3 transition">
            <Settings2 size={13} /> Saldo & limites · {meta.label}
          </Link>
        </div>
      )}
      <div className={`flex ${compact ? "flex-wrap" : "flex-col sm:flex-row"} gap-2 md:gap-3`}>
        {PORTFOLIOS.map((id) => (
          <WalletCard key={id} id={id} active={id === portfolio} onSelect={setPortfolio} compact={compact} config={configs?.[id] ?? null} />
        ))}
      </div>
    </div>
  );
}
