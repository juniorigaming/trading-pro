import Link from "next/link";
import type { ExchangeRatesMarketSnapshot } from "@/lib/macro/market-analysis-types";
import { buildPricePairCandidates } from "@/lib/macro/price-pair-candidates";
import { Badge, Notice } from "./ui";

function spreadText(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
}

export default function PricePairCandidates({ market, compact = false }: { market: ExchangeRatesMarketSnapshot; compact?: boolean }) {
  const result = buildPricePairCandidates(market);
  const warning = result.status !== "no-alignment";

  return (
    <section className={`rounded-xl border border-border bg-surface-2/40 ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary">Top 3 pares · maior diferencial de força</h3>
          <p className="mt-0.5 text-[11px] text-text-muted">Ordenados pelo diferencial D1; W1 confirma a direção. Score macro fica fora do cálculo.</p>
        </div>
        {result.status === "ready" && <Badge className="border-emerald/40 bg-emerald/10 text-emerald">D1 + W1 alinhados</Badge>}
      </div>

      {result.candidates.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {result.candidates.map((candidate, index) => (
            <article key={candidate.symbol} className="rounded-lg border border-border bg-surface-2/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-text-muted">#{index + 1}</span>
                  <h4 className="text-base font-extrabold text-text-primary">{candidate.pair}</h4>
                </div>
                <Badge className={candidate.bias === "LONG" ? "border-emerald/40 bg-emerald/10 text-emerald" : "border-rose/40 bg-rose/10 text-rose"}>{candidate.bias}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-text-secondary">Mais forte: <b className="text-emerald">{candidate.stronger}</b> · mais fraca: <b className="text-rose">{candidate.weaker}</b></p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted tabular-nums">
                <span>Δ D1 <b className="text-text-primary">{spreadText(candidate.oneDaySpread)}</b></span>
                <span>Δ W1 <b className="text-text-primary">{spreadText(candidate.oneWeekSpread)}</b></span>
              </div>
              <Link href={`/smc-ict?symbol=${candidate.symbol}&bias=${candidate.bias}`} className="mt-2 inline-flex text-[11px] font-bold text-accent hover:underline">Analisar no SMC/ICT →</Link>
            </article>
          ))}
        </div>
      ) : (
        <Notice kind={warning ? "warn" : "info"}>{result.message}</Notice>
      )}

      <p className="mt-3 text-[10px] text-text-muted">Candidatos para análise, não ordens de compra/venda. Confirme o gráfico, custos, risco e setup antes de operar.</p>
    </section>
  );
}
