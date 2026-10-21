import { G8 } from "@/lib/ai/types";
import type { ExchangeRatesMarketSnapshot, MarketStrengthEntry } from "@/lib/macro/market-analysis-types";
import { Badge, Notice } from "./ui";

type Period = "1D" | "1W";

function originalScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${String(value).replace(".", ",")}%`;
}

function displayRows(entries: MarketStrengthEntry[]): MarketStrengthEntry[] {
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
  } satisfies MarketStrengthEntry)).sort((a, b) =>
    (a.g8Rank ?? Number.MAX_SAFE_INTEGER) - (b.g8Rank ?? Number.MAX_SAFE_INTEGER)
    || G8.indexOf(a.currency) - G8.indexOf(b.currency),
  );
}

function PeriodTable({
  period,
  entries,
  available,
  message,
  sourceStatus,
}: {
  period: Period;
  entries: MarketStrengthEntry[];
  available: boolean;
  message: string;
  sourceStatus: ExchangeRatesMarketSnapshot["status"];
}) {
  const rows = displayRows(entries);
  const label = sourceStatus === "stale" ? "snapshot antigo" : available ? "atual" : entries.some((row) => row.score !== null) ? "parcial" : "indisponível";
  const badgeClass = sourceStatus === "stale"
    ? "border-orange-500/40 text-orange-400 bg-orange-500/10"
    : available
      ? "border-emerald/40 text-emerald bg-emerald/10"
      : "border-amber/40 text-amber bg-amber/10";

  return (
    <section className="min-w-0 rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary">{period === "1D" ? "Diário — 1D / Today" : "Semanal — 1W"}</h3>
          <p className="text-[10px] text-text-muted">Currency Strength Meter · valores originais</p>
        </div>
        <Badge className={badgeClass}>{label}</Badge>
      </div>
      {!available && <div className="mb-2"><Notice kind={sourceStatus === "unavailable" ? "error" : "warn"}>{message} Nenhum valor ausente foi estimado.</Notice></div>}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[540px] text-xs">
          <thead className="bg-surface-2 text-[10px] uppercase text-text-muted">
            <tr>
              <th className="px-2 py-2 text-left">Rank G8</th>
              <th className="px-2 py-2 text-left">Moeda</th>
              <th className="px-2 py-2 text-right">Score {period} (%)</th>
              <th className="px-2 py-2 text-right">Rank fonte</th>
              <th className="px-2 py-2 text-right">W / L / F</th>
              <th className="px-2 py-2 text-right">Pares</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${period}-${row.currency}`} className="border-t border-border">
                <td className="px-2 py-2 font-bold tabular-nums">{row.g8Rank == null ? "—" : `#${row.g8Rank}`}</td>
                <td className="px-2 py-2 font-extrabold text-text-primary">{row.currency}</td>
                <td className="px-2 py-2 text-right font-extrabold tabular-nums">{originalScore(row.score)}</td>
                <td className="px-2 py-2 text-right text-text-muted tabular-nums">{row.sourceRank == null ? "—" : `#${row.sourceRank}`}</td>
                <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{row.wins ?? "—"} / {row.losses ?? "—"} / {row.flat ?? "—"}</td>
                <td className="px-2 py-2 text-right text-text-secondary tabular-nums">{row.comparisons ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-text-muted">Sempre lista as 8 moedas G8. “—” = campo não publicado/indisponível; não significa zero. O rank da fonte pode incluir NOK/SEK; o rank G8 é reordenado somente entre as oito moedas.</p>
    </section>
  );
}

export default function CurrencyStrengthRankings({ market }: { market: ExchangeRatesMarketSnapshot }) {
  return (
    <div className="space-y-3">
      <Notice kind="info">Força de preço original do Currency Strength Meter (desempenho mediano percentual por horizonte). É distinta dos scores macro por eventos econômicos mostrados na aba “Macro por eventos”; os rankings 1D e 1W são separados e nenhum é somado ao score macro.</Notice>
      <div className="grid gap-3 xl:grid-cols-2">
        <PeriodTable
          period="1D"
          entries={market.primaryRanking}
          available={market.currentRankingAvailable}
          message={market.rankingMessage}
          sourceStatus={market.status}
        />
        <PeriodTable
          period="1W"
          entries={market.weeklyRanking}
          available={market.weeklyRankingAvailable}
          message={market.weeklyRankingMessage}
          sourceStatus={market.status}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
        <a href={market.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">Exchange Rates UK — abrir Currency Strength Meter</a>
        <span>Atualização: {market.updatedAt ? new Date(market.updatedAt).toLocaleString("pt-BR") : "não validada"}</span>
        {market.ageHours !== null && <span>idade da captura: {market.ageHours}h</span>}
      </div>
    </div>
  );
}
