"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import TradeForm from "@/components/TradeForm";

export default function NovaOperacaoPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6 md:mb-8">
        <Link href="/operacoes" className="inline-flex items-center gap-1.5 text-xs text-slate-muted hover:text-white mb-3 transition">
          <ArrowLeft size={14} /> Voltar para Operações
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Nova Operação</h1>
        <p className="text-sm text-slate-muted mt-1">Registre todos os detalhes da sua operação — as métricas do dashboard serão atualizadas automaticamente.</p>
      </header>

      <TradeForm />
    </div>
  );
}
