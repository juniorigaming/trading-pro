"use client";
import { useState } from "react";
import { G8 } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "@/lib/macro/market-analysis-types";
import { Badge, Notice } from "./ui";

type Period = "1D" | "1W";

const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿",
};

export function rankG8StrengthEntries(entries: MarketStrengthEntry[], hideValues = false): MarketStrengthEntry[] {
  const byCurrency = new Map(entries.map((row) => [row.currency, row]));
  return G8.map((currency) => byCurrency.get(currency) ?? ({
    currency,
    score: null,
    sourceRank: null,
    g8Rank: null,
    wins: null,
    losses: null,
    flat: null,
    comparisons: null,
  } satisfies MarketStrengthEntry)).map((row) => {
    const score = row.score !== null && Number.isFinite(row.score) ? row.score : null;
    return hideValues || score === null ? { ...row, score: null, g8Rank: null } : { ...row, score };
  }).sort((a, b) => {
    if (a.score === null && b.score === null) return G8.indexOf(a.currency) - G8.indexOf(b.currency);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || G8.indexOf(a.currency) - G8.indexOf(b.currency);
  });
}

function scoreText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value > 0 ? "+" : ""}${formatted}%`;
}

export default function CurrencyStrengthRankings({ market }: { market: ExchangeRatesMarketSnapshot }) {
  const [period, setPeriod] = useState<Period>("1D");
  const isDaily = period === "1D";
  const entries = isDaily ? market.primaryRanking : market.weeklyRanking;
  const available = isDaily ? market.currentRankingAvailable : market.weeklyRankingAvailable;
  const rows = rankG8StrengthEntries(entries, market.status === "stale");
  const scores = rows.flatMap((row) => row.score !== null && Number.isFinite(row.score) ? [Math.abs(row.score)] : []);
  const maxMagnitude = Math.max(0, ...scores);
  const hasValues = rows.some((row) => row.score !== null);
  const periodComplete = available && rows.every((row) => row.score !== null);
  const statusText = market.status === "stale"
    ? "Desatualizado"
    : periodComplete
      ? "Atualizado"
      : hasValues
        ? "Parcial"
        : "Indisponível";

  return (
    <section className="rounded-xl border border-border bg-surface-2/40 p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary">Força das moedas G8</h3>
          <p className="text-[11px] text-text-muted">Ordenadas da mais forte para a mais fraca no período selecionado.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1" role="tablist" aria-label="Período do ranking">
          {(["1D", "1W"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${period === value ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}
            >
              {value === "1D" ? "D1" : "W1"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-text-muted">Período: <b className="text-text-secondary">{isDaily ? "D1" : "W1"}</b></span>
        <Badge className={market.status === "stale" || !periodComplete ? "border-amber/40 bg-amber/10 text-amber" : "border-emerald/40 bg-emerald/10 text-emerald"}>{statusText}</Badge>
      </div>

      {market.status === "stale" && <div className="mb-2"><Notice kind="warn">Dados desatualizados. Os scores foram ocultados para não apresentá-los como atuais.</Notice></div>}
      {market.status !== "stale" && !periodComplete && <div className="mb-2"><Notice kind={hasValues ? "warn" : "error"}>{hasValues ? "Dados parciais. Valores indisponíveis permanecem sem score." : `Dados de força indisponíveis para ${isDaily ? "D1" : "W1"}.`}</Notice></div>}

      <ol className="space-y-1.5" aria-label={`Ranking G8 ${isDaily ? "D1" : "W1"}`}>
        {rows.map((row, index) => {
          const score = row.score;
          const magnitude = score === null || maxMagnitude === 0 ? 0 : Math.max(3, Math.abs(score) / maxMagnitude * 100);
          const color = score === null || score === 0 ? "bg-slate-400" : score > 0 ? "bg-emerald" : "bg-rose";
          return (
            <li key={`${period}-${row.currency}`} className="grid grid-cols-[2rem_1.75rem_2.5rem_minmax(3rem,1fr)_4.5rem] items-center gap-2 rounded-lg border border-border/70 bg-surface-2/50 px-2.5 py-2">
              <span className="text-center text-[11px] font-bold tabular-nums text-text-muted">{score === null ? "—" : `#${index + 1}`}</span>
              <span className="text-base leading-none" aria-hidden="true">{FLAGS[row.currency]}</span>
              <span className="text-xs font-extrabold text-text-primary">{row.currency}</span>
              <span className="block h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                <span className={`block h-full rounded-full ${color}`} style={{ width: `${magnitude}%` }} />
              </span>
              <span className={`text-right text-xs font-bold tabular-nums ${score === null ? "text-text-muted" : score > 0 ? "text-emerald" : score < 0 ? "text-rose" : "text-text-secondary"}`}>{scoreText(score)}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[10px] text-text-muted">“—” indica dado indisponível; não representa zero. As barras mostram magnitude relativa dentro do período.</p>
    </section>
  );
}
