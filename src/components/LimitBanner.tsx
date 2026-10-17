"use client";
/**
 * Banner de bloqueio comportamental: aparece em /operacoes/novo quando o limite de perda
 * diária ou o máximo de operações do dia foi atingido. Não impede o registro (o trade já
 * pode ter acontecido na corretora) — só deixa o aviso impossível de ignorar.
 */
import { useMemo } from "react";
import Link from "next/link";
import { OctagonX, AlertTriangle } from "lucide-react";
import { useTrades, useConfig } from "@/hooks/useTradeData";
import { computeAccount } from "@/lib/account";
import { computeDayGuard } from "@/lib/day-guard";

export default function LimitBanner() {
  const { trades } = useTrades();
  const { config } = useConfig();
  const account = useMemo(() => computeAccount(trades, config), [trades, config]);
  const guard = computeDayGuard(account, config);

  if (guard.blocked) {
    return (
      <div className="flex items-start gap-3 p-4 mb-5 rounded-xl border border-rose/40 bg-rose/10">
        <OctagonX size={20} className="text-rose shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-extrabold text-rose">Seu plano diz para PARAR por hoje</p>
          <ul className="text-xs text-text-secondary mt-1 list-disc pl-4">
            {guard.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="text-[11px] text-text-muted mt-2">Se esta operação já aconteceu, registre-a normalmente — mas marque “Overtrading” na seção de disciplina. Limites em <Link href="/configuracoes#carteira" className="text-sky hover:underline">Configurações</Link>.</p>
        </div>
      </div>
    );
  }
  if (guard.warnings.length > 0) {
    return (
      <div className="flex items-center gap-2 p-3 mb-5 rounded-xl border border-amber/30 bg-amber/5 text-xs font-semibold text-amber">
        <AlertTriangle size={14} /> {guard.warnings.join(" · ")}
      </div>
    );
  }
  return null;
}
