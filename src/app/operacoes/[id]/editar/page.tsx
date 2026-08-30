"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import TradeForm from "@/components/TradeForm";
import { Trade } from "@/lib/types";

export default function EditarOperacaoPage() {
  const params = useParams();
  const id = params.id as string;
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trades/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Operação não encontrada");
        return res.json();
      })
      .then(setTrade)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

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
        <div className="glass-card-strong p-12 text-center text-rose text-sm">{error}</div>
      ) : (
        trade && <TradeForm trade={trade} />
      )}
    </div>
  );
}
