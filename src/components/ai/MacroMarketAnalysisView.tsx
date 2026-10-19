"use client";
import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import type { Currency } from "@/lib/ai/types";
import {
  MARKET_REPORT_SECTION_IDS,
  MARKET_REPORT_SECTION_TITLES,
  type CentralBankPolicySnapshot,
  type ExchangeRatesMarketSnapshot,
  type MacroEvidenceEvent,
  type MarketMacroAnalysisResponse,
  type MarketReportSectionId,
} from "@/lib/macro/market-analysis-types";
import { Badge, Btn, Notice, Section } from "./ui";

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
const CURRENCY_NAMES: Record<Currency, string> = {
  USD: "Dólar americano", EUR: "Euro", GBP: "Libra esterlina", JPY: "Iene japonês",
  CHF: "Franco suíço", CAD: "Dólar canadense", AUD: "Dólar australiano", NZD: "Dólar neozelandês",
};
const BIAS_LABEL: Record<string, string> = {
  BULLISH: "positivo", NEUTRAL: "neutro", BEARISH: "negativo", INSUFFICIENT_DATA: "sem evidência suficiente",
};
const QUALITY_LABEL: Record<string, string> = {
  STRONG: "boa cobertura", MIXED: "mista", WEAK: "limitada", INSUFFICIENT_DATA: "insuficiente",
};
const POLICY_LABEL: Record<string, string> = {
  HAWKISH: "hawkish", NEUTRAL: "neutro", DOVISH: "dovish", MIXED: "misto", UNCLEAR: "indefinido", UNAVAILABLE: "indisponível",
};
const ALIGNMENT_LABEL: Record<string, string> = {
  ALIGNED: "alinhados", DIVERGENT: "divergentes", MIXED: "misto/neutro", UNAVAILABLE: "indisponível",
};

function numberText(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
function signedScore(value: number | null | undefined, digits?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const text = digits === undefined ? String(value).replace(".", ",") : numberText(value, digits);
  return `${value > 0 ? "+" : ""}${text}`;
}
function signedPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${numberText(value, 6)}%`;
}
function ppSpread(low: number | null, high: number | null): string {
  if (low === null || high === null) return "—";
  return Math.abs(high - low) < 0.0000001 ? `${numberText(low, 4)} p.p.` : `${numberText(low, 4)} a ${numberText(high, 4)} p.p.`;
}
function externalHref(url: string) {
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Fonte oficial <ExternalLink size={11} /></a>;
}
function statusBadge(status: string) {
  const kind = status === "available" ? "border-emerald/40 text-emerald bg-emerald/10" : status === "partial" ? "border-amber/40 text-amber bg-amber/10" : status === "stale" ? "border-orange-500/40 text-orange-400 bg-orange-500/10" : "border-rose/40 text-rose bg-rose/10";
  const label: Record<string, string> = { available: "disponível", partial: "parcial", stale: "desatualizado", unavailable: "indisponível" };
  return <Badge className={kind}>{label[status] ?? status}</Badge>;
}
function evidenceOrigin(event: MacroEvidenceEvent) {
  return event.origin === "user_confirmed" ? "print/manual confirmado (complementar)" : "registro salvo";
}
function BiasText({ value }: { value: string }) {
  const color = value === "BULLISH" ? "text-emerald" : value === "BEARISH" ? "text-rose" : "text-text-secondary";
  return <span className={`font-bold ${color}`}>{BIAS_LABEL[value] ?? value}</span>;
}

function RankingTable({ market }: { market: ExchangeRatesMarketSnapshot }) {
  if (!market.primaryRanking.length) return <p className="text-xs text-text-muted">Ranking atual não obtido. Nenhum score foi estimado.</p>;
  return (
    <div className="space-y-2">
      {!market.currentRankingAvailable && <Notice kind="warn">{market.status === "stale" ? "Os valores abaixo são apenas a última captura conhecida e não são tratados como ranking atual." : "O snapshot 1D está incompleto ou não foi validado como ranking G8 atual; scores ausentes ficam sem valor e nenhum foi estimado."}</Notice>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr>
            <th className="px-2 py-2 text-left">Rank G8</th><th className="px-2 py-2 text-left">Rank fonte</th><th className="px-2 py-2 text-left">Moeda</th><th className="px-2 py-2 text-right">Score 1D</th><th className="px-2 py-2 text-right">Vitórias</th><th className="px-2 py-2 text-right">Derrotas</th><th className="px-2 py-2 text-right">Empates</th><th className="px-2 py-2 text-right">Pares</th>
          </tr></thead>
          <tbody>{market.primaryRanking.map((row) => <tr key={row.currency} className="border-t border-border">
            <td className="px-2 py-2 font-bold">{row.g8Rank == null ? "—" : `#${row.g8Rank}`}</td>
            <td className="px-2 py-2 text-text-muted">{row.sourceRank == null ? "—" : `#${row.sourceRank}`}</td>
            <td className="px-2 py-2 font-extrabold text-text-primary">{row.currency}</td>
            <td className="px-2 py-2 text-right font-extrabold tabular-nums">{signedScore(row.score)}</td>
            <td className="px-2 py-2 text-right tabular-nums">{row.wins ?? "—"}</td><td className="px-2 py-2 text-right tabular-nums">{row.losses ?? "—"}</td>
            <td className="px-2 py-2 text-right tabular-nums">{row.flat ?? "—"}</td><td className="px-2 py-2 text-right tabular-nums">{row.comparisons ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-[10px] text-text-muted">Score 1D e posição original da fonte não são alterados. A posição G8 é recalculada após filtrar NOK/SEK; a coluna “Rank fonte” mantém a posição publicada entre as moedas comparadas pela fonte.</p>
      {market.updatedAt && <p className="text-[10px] text-text-muted">Atualizado pela fonte: {new Date(market.updatedAt).toLocaleString("pt-BR")} · idade {market.ageHours ?? "—"}h.</p>}
    </div>
  );
}

function PersistenceTable({ market }: { market: ExchangeRatesMarketSnapshot }) {
  const oneDay = new Map(market.primaryRanking.map((row) => [row.currency, row.score]));
  const fiveDay = new Map(market.persistence.fiveDay.map((row) => [row.currency, row]));
  const monthToDate = new Map(market.persistence.monthToDate.map((row) => [row.currency, row]));
  const yearToDate = new Map(market.persistence.yearToDate.map((row) => [row.currency, row.score]));
  return (
    <div className="space-y-2">
      {!market.currentRankingAvailable && <Notice kind="warn">Os dados 1D desta tabela não são tratados como ranking atual validado.</Notice>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr><th className="px-2 py-2 text-left">Moeda</th><th className="px-2 py-2 text-right">1D oficial</th><th className="px-2 py-2 text-right">5D heatmap</th><th className="px-2 py-2 text-right">MTD heatmap</th><th className="px-2 py-2 text-right">YTD oficial</th><th className="px-2 py-2 text-left">Base</th></tr></thead>
          <tbody>{CURRENCIES.map((currency) => {
            const five = fiveDay.get(currency), mtd = monthToDate.get(currency);
            const fiveStatus = five && five.observations < five.expectedObservations ? `parcial ${five.observations}/7` : "mediana G8";
            const mtdStatus = mtd && mtd.observations < mtd.expectedObservations ? `parcial ${mtd.observations}/7` : "mediana G8";
            return <tr key={currency} className="border-t border-border">
              <td className="px-2 py-2 font-bold">{currency}</td><td className="px-2 py-2 text-right tabular-nums">{signedScore(oneDay.get(currency))}</td>
              <td className="px-2 py-2 text-right tabular-nums" title={five?.method}>{signedPct(five?.value)} <span className="text-[9px] text-text-muted">({fiveStatus})</span></td>
              <td className="px-2 py-2 text-right tabular-nums" title={mtd?.method}>{signedPct(mtd?.value)} <span className="text-[9px] text-text-muted">({mtdStatus})</span></td>
              <td className="px-2 py-2 text-right tabular-nums">{signedScore(yearToDate.get(currency))}</td><td className="px-2 py-2 text-[10px] text-text-muted">1D/YTD: Meter · 5D/MTD: heatmap G8</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {market.persistence.notes.map((note, i) => <p key={i} className="text-[10px] text-text-muted">• {note}</p>)}
    </div>
  );
}

function PolicyTable({ policies }: { policies: CentralBankPolicySnapshot[] }) {
  return <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-xs min-w-[920px]">
      <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr><th className="px-2 py-2 text-left">Moeda / BC</th><th className="px-2 py-2 text-left">Taxa oficial</th><th className="px-2 py-2 text-left">Data / semântica</th><th className="px-2 py-2 text-left">Última decisão</th><th className="px-2 py-2 text-left">Próxima</th><th className="px-2 py-2 text-left">Fonte</th></tr></thead>
      <tbody>{policies.map((policy) => <tr key={policy.currency} className="border-t border-border align-top">
        <td className="px-2 py-2"><b>{policy.currency}</b><span className="block text-[10px] text-text-muted">{policy.bank}</span></td>
        <td className="px-2 py-2 font-bold">{policy.status === "available" ? policy.rateText : "indisponível"}<span className="block text-[10px] text-text-muted">{policy.detail ?? ""}</span></td>
        <td className="px-2 py-2">{policy.asOf ?? "—"}<span className="block max-w-[240px] text-[10px] text-text-muted">{policy.asOfMeaning}</span></td>
        <td className="px-2 py-2">{policy.latestDecisionAt ?? "—"}</td><td className="px-2 py-2">{policy.nextDecision ?? "—"}</td>
        <td className="px-2 py-2 whitespace-nowrap">{externalHref(policy.decisionUrl ?? policy.sourceUrl)}{policy.decisionUrl && <span className="block">{externalHref(policy.sourceUrl)}</span>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function EventTable({ events }: { events: MacroEvidenceEvent[] }) {
  if (!events.length) return <p className="text-xs text-text-muted">Nenhuma divulgação recente com Actual confirmado nesta execução.</p>;
  return <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-xs min-w-[940px]">
      <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr><th className="px-2 py-2 text-left">Data</th><th className="px-2 py-2 text-left">Moeda / evento</th><th className="px-2 py-2 text-left">Actual</th><th className="px-2 py-2 text-left">Forecast</th><th className="px-2 py-2 text-left">Previous</th><th className="px-2 py-2 text-left">Origem</th><th className="px-2 py-2 text-left">Interpretação salva</th></tr></thead>
      <tbody>{events.map((event) => <tr key={`${event.origin}:${event.id}`} className="border-t border-border align-top">
        <td className="px-2 py-2 whitespace-nowrap">{event.date ?? "—"}</td><td className="px-2 py-2"><b>{event.currency}</b><span className="block max-w-[230px]">{event.event}</span></td>
        <td className="px-2 py-2 font-bold">{event.actual ?? "—"}</td><td className="px-2 py-2">{event.forecast ?? "—"}</td><td className="px-2 py-2">{event.previous ?? "—"}</td>
        <td className="px-2 py-2 text-[10px] text-text-muted">{evidenceOrigin(event)}<span className="block">{event.source}</span></td>
        <td className="px-2 py-2 max-w-[340px] text-[10px] text-text-muted">{event.interpretation ? `${event.interpretation.currencyImplication} · ${event.interpretation.centralBankImplication} · ${event.interpretation.reasoningSummary}` : event.kind === "upcoming" ? "Evento futuro; sem resultado ainda." : "Sem interpretação salva — valor bruto preservado."}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function DivergenceTable({ report }: { report: MarketMacroAnalysisResponse }) {
  return <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-xs min-w-[820px]">
      <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr><th className="px-2 py-2 text-left">Moeda</th><th className="px-2 py-2 text-left">Força 1D de preço</th><th className="px-2 py-2 text-left">Fundamento</th><th className="px-2 py-2 text-left">Qualidade</th><th className="px-2 py-2 text-left">Confiança</th><th className="px-2 py-2 text-left">Leitura separada</th></tr></thead>
      <tbody>{report.divergences.map((row) => <tr key={row.currency} className="border-t border-border align-top"><td className="px-2 py-2 font-bold">{row.currency}</td><td className="px-2 py-2">{row.marketDirection} {signedScore(row.marketScore)}</td><td className="px-2 py-2"><BiasText value={row.fundamentalBias} /></td><td className="px-2 py-2">{QUALITY_LABEL[row.fundamentalQuality] ?? row.fundamentalQuality}</td><td className="px-2 py-2">{row.confidence}</td><td className="px-2 py-2"><Badge className={row.status === "DIVERGENT" ? "border-amber/40 bg-amber/10 text-amber" : row.status === "ALIGNED" ? "border-emerald/40 bg-emerald/10 text-emerald" : "border-border text-text-muted"}>{ALIGNMENT_LABEL[row.status]}</Badge><p className="mt-1 text-[10px] text-text-muted">{row.explanation}</p></td></tr>)}</tbody>
    </table>
  </div>;
}

function PairTable({ report }: { report: MarketMacroAnalysisResponse }) {
  if (!report.pairAsymmetries.length) return <p className="text-xs text-text-muted">Sem combinações calculadas: o ranking 1D atual não está completo e validado.</p>;
  return <div className="space-y-2">
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs min-w-[900px]">
        <thead className="bg-surface-2 text-[10px] uppercase text-text-muted"><tr><th className="px-2 py-2 text-left">Par (ordem G8)</th><th className="px-2 py-2 text-left">Assimetria 1D</th><th className="px-2 py-2 text-left">Mais forte por preço</th><th className="px-2 py-2 text-left">Alinhamento fundamentos</th><th className="px-2 py-2 text-left">Spread taxa oficial</th></tr></thead>
        <tbody>{report.pairAsymmetries.map((row) => <tr key={row.pair} className="border-t border-border">
          <td className="px-2 py-2 font-bold">{row.pair}</td><td className="px-2 py-2 tabular-nums">{signedScore(row.marketSpread, 4)} <span className="text-[10px] text-text-muted">({row.base}: {signedScore(row.baseMarketScore)} · {row.quote}: {signedScore(row.quoteMarketScore)})</span></td>
          <td className="px-2 py-2">{row.strongerByMarket === "TIED" ? "empate" : row.strongerByMarket}</td><td className="px-2 py-2">{ALIGNMENT_LABEL[row.fundamentalAlignment]}<span className="block text-[10px] text-text-muted">confiança {row.base}: {row.baseConfidence} · {row.quote}: {row.quoteConfidence}</span></td>
          <td className="px-2 py-2">{ppSpread(row.policyRateSpreadLow, row.policyRateSpreadHigh)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-[10px] text-text-muted">Exibidos os pares com maior diferença absoluta entre scores 1D da fonte. Diferencial de política é apenas contexto (instrumentos/curvas não equivalentes); não é sinal nem recomendação de compra/venda.</p>
  </div>;
}

function CurrencyDetails({ report }: { report: MarketMacroAnalysisResponse }) {
  const views = new Map(report.narrative.currencyViews.map((item) => [item.currency, item]));
  const scores = new Map(report.marketStrength.primaryRanking.map((item) => [item.currency, item.score]));
  const policies = new Map(report.policyRates.map((item) => [item.currency, item]));
  return <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
    {CURRENCIES.map((currency) => {
      const view = views.get(currency);
      const policy = policies.get(currency);
      return <article key={currency} className="rounded-xl border border-border bg-surface-2/50 p-3">
        <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-text-primary">{currency}</b><span className="text-[10px] text-text-muted">{CURRENCY_NAMES[currency]}</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]"><Badge className="border-border text-text-secondary">1D {signedScore(report.marketStrength.currentRankingAvailable ? scores.get(currency) : null)}</Badge><Badge className="border-border text-text-secondary">fund. <BiasText value={view?.fundamentalBias ?? "INSUFFICIENT_DATA"} /></Badge></div>
        <p className="mt-2 text-[10px] text-text-muted">Qualidade: <b>{QUALITY_LABEL[view?.fundamentalQuality ?? "INSUFFICIENT_DATA"]}</b> · confiança: <b>{view?.confidence ?? "LOW"}</b></p>
        <p className="mt-1 text-[10px] text-text-muted">Política: <b>{POLICY_LABEL[view?.policyStance ?? "UNAVAILABLE"]}</b>{policy?.status === "available" ? ` · ${policy.rateText}` : " · taxa indisponível"}</p>
        <p className="mt-2 text-xs leading-snug text-text-secondary">{view?.summary ?? "Sem leitura qualitativa disponível."}</p>
        {!!view?.drivers.length && <div className="mt-2"><p className="text-[10px] font-bold text-text-muted">Fatores observados</p><ul className="mt-1 space-y-1">{view.drivers.map((driver, i) => <li key={i} className="text-[10px] text-text-secondary">• {driver}</li>)}</ul></div>}
        {!!view?.risks.length && <div className="mt-2"><p className="text-[10px] font-bold text-amber">Riscos / limites</p><ul className="mt-1 space-y-1">{view.risks.map((risk, i) => <li key={i} className="text-[10px] text-text-muted">• {risk}</li>)}</ul></div>}
      </article>;
    })}
  </div>;
}

function renderSectionExtra(id: MarketReportSectionId, report: MarketMacroAnalysisResponse) {
  if (id === "source_reliability") return <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3 text-xs">
    <p><b>Exchange Rates UK:</b> {statusBadge(report.marketStrength.status)} <a href={report.marketStrength.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-accent hover:underline">abrir fonte</a></p>
    <p className="text-text-muted">{report.marketStrength.rankingMessage}</p>
    <p className="text-text-muted">Atualização: {report.marketStrength.updatedAt ? new Date(report.marketStrength.updatedAt).toLocaleString("pt-BR") : "não validada"} · captura: {new Date(report.marketStrength.retrievedAt).toLocaleString("pt-BR")}</p>
    <p><b>Eventos salvos:</b> {report.evidence.status === "available" ? "consulta somente leitura concluída" : "indisponíveis"}. {report.evidence.message ?? ""}</p>
  </div>;
  if (id === "market_strength_1d") return <RankingTable market={report.marketStrength} />;
  if (id === "fundamental_background") return <div className="space-y-2"><Notice kind="info">Qualidade dos fundamentos, viés e confiança são campos distintos. A força de preço 1D não compõe o julgamento fundamental.</Notice><p className="text-[10px] text-text-muted">Visão geral por moeda disponível também no bloco 11, com evidências e riscos individuais.</p></div>;
  if (id === "monetary_policy_g8") return <div className="space-y-2"><PolicyTable policies={report.policyRates} /><p className="text-[10px] text-text-muted">Taxas oficiais atuais não equivalem a expectativas de mercado; probabilidades/preços de cortes ou altas só seriam informados se uma fonte específica os fornecesse.</p></div>;
  if (id === "external_factors") return <div className="grid gap-2 md:grid-cols-2">{report.narrative.externalFactors.map((factor, index) => <article key={index} className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center gap-2"><b className="text-xs">{factor.name}</b><Badge className={factor.status === "EVIDENCED" ? "border-emerald/40 text-emerald" : "border-amber/40 text-amber"}>{factor.status === "EVIDENCED" ? factor.impact : "sem fonte validada"}</Badge></div><p className="mt-1 text-[11px] text-text-muted">{factor.detail}</p>{factor.currencies.length > 0 && <p className="mt-1 text-[10px] text-text-muted">Moedas: {factor.currencies.join(", ")}</p>}</article>)}</div>;
  if (id === "horizon_persistence") return <PersistenceTable market={report.marketStrength} />;
  if (id === "actual_vs_forecast") return <div className="space-y-2"><Notice kind="info">Actual × Forecast tem prioridade; Previous é contexto. Prints confirmados são evidência complementar, não substituem o ranking primário.</Notice><EventTable events={[...report.evidence.released, ...report.evidence.upcoming]} /></div>;
  if (id === "price_fundamental_divergences") return <DivergenceTable report={report} />;
  if (id === "pair_asymmetries") return <PairTable report={report} />;
  if (id === "currency_by_currency") return <CurrencyDetails report={report} />;
  if (id === "macro_catalysts") return <EventTable events={report.evidence.upcoming} />;
  if (id === "risk_scenarios") return report.narrative.keyRisks.length ? <div className="grid gap-2 md:grid-cols-2">{report.narrative.keyRisks.map((risk, index) => <article key={index} className="rounded-lg border border-amber/30 bg-amber/5 p-3"><b className="text-xs text-amber">{risk.risk}</b><p className="mt-1 text-[11px] text-text-secondary">Gatilho: {risk.trigger}</p><p className="mt-1 text-[10px] text-text-muted">Moedas: {risk.currencies.join(", ") || "não especificadas"} · confiança: {risk.confidence}</p></article>)}</div> : <p className="text-xs text-text-muted">Nenhum risco específico com referência verificável foi listado pela análise.</p>;
  if (id === "confidence_and_limitations") return <div className="space-y-2">
    <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg border border-border p-3 text-xs"><span className="block text-[10px] text-text-muted">Narrativa IA</span><b>{report.analysisStatus}</b></div><div className="rounded-lg border border-border p-3 text-xs"><span className="block text-[10px] text-text-muted">Bancos com taxa lida</span><b>{report.policyRates.filter((policy) => policy.status === "available").length}/8</b></div><div className="rounded-lg border border-border p-3 text-xs"><span className="block text-[10px] text-text-muted">Eventos usados</span><b>{report.evidence.released.length} liberados · {report.evidence.upcoming.length} futuros</b></div></div>
    {report.warnings.map((warning, index) => <Notice key={index} kind="warn">{warning}</Notice>)}
  </div>;
  if (id === "methodology_and_disclaimer") return <div className="space-y-2 text-xs text-text-secondary">
    <p>Ranking primário: Currency Strength Meter 1D/Today do Exchange Rates UK. Scores originais preservados; NOK/SEK são removidas apenas da lista G8. 5D/MTD, quando disponíveis, são medianas derivadas da heatmap G8; YTD usa score publicado do Meter.</p>
    <p>Eventos existentes são consultados sem atualizar interpretações ou scores. Eventos de screenshots enviados agora só entram se confirmados e permanecem complementares. Taxas oficiais e textos de política são leitura pontual das páginas oficiais, cada uma com status e data.</p>
    <p><b>Assimetria não é recomendação de compra/venda.</b> Esta análise é informativa, pode estar incompleta e não substitui validação de dados, gestão de risco ou avaliação independente.</p>
  </div>;
  return null;
}

export default function MacroMarketAnalysisView({ report, onBack }: { report: MarketMacroAnalysisResponse; onBack: () => void }) {
  const mock = report.analysisStatus === "mock";
  const unavailable = report.analysisStatus === "unavailable";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Btn variant="ghost" onClick={onBack}><ArrowLeft size={15} />Voltar</Btn>
      <Badge className={mock || unavailable ? "border-amber/40 bg-amber/10 text-amber" : "border-emerald/40 bg-emerald/10 text-emerald"}>{mock ? "IA MOCK — narrativa não real" : unavailable ? "IA indisponível" : "análise qualitativa gerada"}</Badge>
      <span className="text-[11px] text-text-muted">{new Date(report.generatedAt).toLocaleString("pt-BR")} · {report.ai.provider} / {report.ai.model}</span>
    </div>
    {mock && <Notice kind="warn"><b>Modo MOCK.</b> Nenhuma leitura qualitativa real foi gerada. Os dados determinísticos da fonte continuam identificados separadamente; configure um provider real antes de usar a narrativa.</Notice>}
    {unavailable && <Notice kind="error">A chamada de IA falhou. O sistema manteve os dados das fontes, mas não fabricou conclusões fundamentais.</Notice>}
    {!report.marketStrength.currentRankingAvailable && <Notice kind="warn"><ShieldAlert size={14} className="inline mr-1" />{report.marketStrength.rankingMessage} Nenhum ranking foi estimado.</Notice>}
    <div className="glass-card p-4 md:p-5 border border-accent/30">
      <p className="text-[10px] uppercase tracking-wider text-text-muted">Resumo da execução</p>
      <h2 className="mt-1 text-lg font-extrabold text-text-primary">{report.narrative.headline}</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{report.narrative.executiveSummary}</p>
    </div>
    <div className="grid gap-3">
      {MARKET_REPORT_SECTION_IDS.map((id) => {
        const section = report.narrative.sections.find((item) => item.id === id);
        return <Section key={id} title={MARKET_REPORT_SECTION_TITLES[id]} sub={section?.evidenceRefs.length ? `Evidências: ${section.evidenceRefs.join(" · ")}` : "Sem referência numérica além dos dados tabulares exibidos abaixo."}>
          <p className="text-xs leading-relaxed text-text-secondary">{section?.summary ?? "Bloco não retornado pela IA."}</p>
          {!!section?.observations.length && <ul className="mt-2 space-y-1">{section.observations.map((observation, i) => <li key={i} className="text-[11px] leading-snug text-text-muted">• {observation}</li>)}</ul>}
          <div className="mt-3">{renderSectionExtra(id, report)}</div>
        </Section>;
      })}
    </div>
  </div>;
}
