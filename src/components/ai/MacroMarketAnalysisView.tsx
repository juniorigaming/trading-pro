"use client";
import { ArrowLeft } from "lucide-react";
import type { MarketMacroAnalysisResponse } from "@/lib/macro/market-analysis-types";
import { Badge, Btn, Notice } from "./ui";
import CurrencyStrengthRankings from "./CurrencyStrengthRankings";

export default function MacroMarketAnalysisView({ report, onBack }: { report: MarketMacroAnalysisResponse; onBack: () => void }) {
  const hasNarrative = report.analysisStatus === "available";
  const isStale = report.marketStrength.status === "stale";
  const hasBothRankings = !isStale && report.marketStrength.currentRankingAvailable && report.marketStrength.weeklyRankingAvailable;
  const hasCurrentRankings = !isStale && (report.marketStrength.currentRankingAvailable || report.marketStrength.weeklyRankingAvailable);
  const rankingLabel = isStale ? "Dados desatualizados" : hasBothRankings ? "D1 e W1 atualizados" : hasCurrentRankings ? "Dados parciais" : "Sem dados atuais";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="ghost" onClick={onBack}><ArrowLeft size={15} />Voltar</Btn>
        <Badge className={hasBothRankings ? "border-emerald/40 bg-emerald/10 text-emerald" : "border-amber/40 bg-amber/10 text-amber"}>{rankingLabel}</Badge>
        {report.marketStrength.updatedAt && <span className="text-[11px] text-text-muted">Dados atualizados em {new Date(report.marketStrength.updatedAt).toLocaleString("pt-BR")}</span>}
      </div>

      {report.macroRefresh && <Notice kind={report.macroRefresh.status === "updated" ? "info" : "warn"}>{report.macroRefresh.message}</Notice>}
      {!hasNarrative && <Notice kind="warn">A leitura textual da IA não ficou disponível; os dados numéricos aparecem abaixo sem estimativas.</Notice>}

      <CurrencyStrengthRankings market={report.marketStrength} />

      <p className="text-[10px] text-text-muted">O ranking mostra força relativa; não é uma ordem automática de entrada.</p>
    </div>
  );
}
