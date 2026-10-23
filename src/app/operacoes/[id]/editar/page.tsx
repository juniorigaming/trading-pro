"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import TradeForm from "@/components/TradeForm";
import { Trade } from "@/lib/types";
import { fetchTrade, TradeNotFoundError } from "@/lib/trade-fetch";

export default function EditarOperacaoPage() {
  const params = useParams();
  const id = params.id as string;
  const [loaded, setLoaded] = useState<{ id: string; reloadKey: number; trade: Trade | null; error: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTrade(id)
      .then((trade) => {
        if (!cancelled) setLoaded({ id, reloadKey, trade, error: null });
      })
      .catch((e) => {
        if (!cancelled) setLoaded({ id, reloadKey, trade: null, error: e instanceof TradeNotFoundError ? "Operação não encontrada." : e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const isCurrentLoad = loaded?.id === id && loaded.reloadKey === reloadKey;
  const trade = isCurrentLoad ? loaded.trade : null;
  const error = isCurrentLoad ? loaded.error : null;
  const loading = !isCurrentLoad;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6 md:mb-8">
        <Link href="/operacoes" className="inline-flex items-center gap-1.5 text-xs text-slate-muted hover:text-text-primary mb-3 transition">
          <ArrowLeft size={14} /> Voltar para Operações
        </Link>
        <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Editar Operação #{id}</h1>
        <p className="text-sm text-slate-muted mt-1">Atualize os detalhes desta operação.</p>
      </header>

      {loading ? (
        <div className="glass-card-strong p-12 text-center text-slate-muted text-sm">Carregando...</div>
      ) : error ? (
        <div className="glass-card-strong p-12 text-center">
          <p className="text-sm text-rose mb-4">{error}</p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-dark-800 hover:bg-dark-700 border border-white/5 text-text-primary text-xs font-semibold rounded-xl transition"
          >
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </div>
      ) : (
        trade && <TradeForm trade={trade} />
      )}
    </div>
  );
}
