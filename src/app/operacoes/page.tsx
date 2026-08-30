"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Eye, Pencil, Trash2, Download } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";
import { formatCurrency, formatR } from "@/lib/utils";
import { Trade } from "@/lib/types";

export default function OperacoesPage() {
  const { trades, loading, refetch } = useTrades();
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("Todos");
  const [assetFilter, setAssetFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const uniqueAssets = useMemo(() => Array.from(new Set(trades.map((t) => t.asset))).sort(), [trades]);
  const uniqueSessions = useMemo(() => Array.from(new Set(trades.map((t) => t.session))).sort(), [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (search && !t.asset.toLowerCase().includes(search.toLowerCase()) && !(t.setup || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (resultFilter !== "Todos" && t.resultType !== resultFilter) return false;
      if (assetFilter !== "all" && t.asset !== assetFilter) return false;
      if (sessionFilter !== "all" && t.session !== sessionFilter) return false;
      if (directionFilter !== "all" && t.direction !== directionFilter) return false;
      return true;
    });
  }, [trades, search, resultFilter, assetFilter, sessionFilter, directionFilter]);

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta operação?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/trades/${id}`, { method: "DELETE" });
      await refetch();
    } finally {
      setDeletingId(null);
    }
  };

  const exportCSV = () => {
    const headers = ["ID", "Data", "Hora", "Ativo", "Direção", "Sessão", "Timeframe", "Setup", "Entrada", "Stop Loss", "Take Profit", "Risco $", "Resultado $", "Resultado R", "Resultado %", "Resultado Final"];
    const rows = filtered.map((t) => [
      t.id, new Date(t.date).toLocaleDateString("pt-BR"), t.time, t.asset, t.direction, t.session, t.timeframeEntry || "",
      t.setup || "", t.entryPrice ?? "", t.stopLoss ?? "", t.takeProfit ?? "", t.riskAmount ?? "",
      t.resultAmount ?? "", t.resultR ?? "", t.resultPercent ?? "", t.resultType,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "operacoes.csv";
    link.click();
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Operações</h1>
          <p className="text-sm text-slate-muted mt-1">Histórico completo das suas operações registradas ({trades.length})</p>
        </div>
      </header>

      <div className="glass-card p-5 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por ativo, setup..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-slate-muted focus:outline-none focus:ring-1 focus:ring-emerald/30 transition"
            />
          </div>
          <select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald/30">
            <option value="all">Todos os ativos</option>
            {uniqueAssets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald/30">
            <option value="all">Todas as sessões</option>
            {uniqueSessions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald/30">
            <option value="all">Todas as direções</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-dark-800 hover:bg-dark-700 border border-white/5 text-text-primary text-xs font-semibold rounded-xl transition">
            <Download size={14} /> CSV
          </button>
          <Link
            href="/operacoes/novo"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-bold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)] transition active:scale-[0.98]"
          >
            <Plus size={16} />
            Nova Operação
          </Link>
        </div>
        <div className="flex gap-2 mt-3">
          {["Todos", "WIN", "LOSS", "BREAK EVEN"].map((f) => (
            <button
              key={f}
              onClick={() => setResultFilter(f)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                resultFilter === f ? "bg-emerald/10 text-emerald border-emerald/20" : "text-slate-muted hover:text-text-primary hover:bg-white/[0.04] border-white/[0.05]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="glass-card-strong p-12 text-center text-slate-muted text-sm">Carregando operações...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card-strong p-12 text-center">
          <p className="text-sm text-slate-muted mb-3">Nenhuma operação encontrada.</p>
          <Link href="/operacoes/novo" className="text-sm font-bold text-emerald hover:underline">+ Registrar nova operação</Link>
        </div>
      ) : (
        <div className="glass-card-strong overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-muted bg-dark-900/60 border-b border-white/5">
                <th className="text-left px-4 py-3 font-semibold">Data / Hora</th>
                <th className="text-left px-4 py-3 font-semibold">Ativo</th>
                <th className="text-left px-4 py-3 font-semibold">Dir</th>
                <th className="text-left px-4 py-3 font-semibold">Sessão</th>
                <th className="text-left px-4 py-3 font-semibold">Setup</th>
                <th className="text-left px-4 py-3 font-semibold">Resultado</th>
                <th className="text-right px-4 py-3 font-semibold">Resultado $</th>
                <th className="text-right px-4 py-3 font-semibold">R</th>
                <th className="text-center px-4 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: Trade) => (
                <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-text-primary">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                    <p className="text-[10px] text-slate-muted">{t.time}</p>
                  </td>
                  <td className="px-4 py-3 font-bold text-text-primary">
                    {t.asset} {t.isDemo && <span className="text-[9px] text-sky ml-1">(demo)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${t.direction === "BUY" ? "bg-emerald/10 text-emerald" : "bg-rose/10 text-rose"}`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{t.session}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{t.setup || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-extrabold px-2 py-0.5 rounded ${t.resultType === "WIN" ? "text-emerald bg-emerald/10" : t.resultType === "LOSS" ? "text-rose bg-rose/10" : "text-sky bg-sky/10"}`}>
                      {t.resultType}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${(t.resultAmount || 0) > 0 ? "text-emerald" : (t.resultAmount || 0) < 0 ? "text-rose" : "text-sky"}`}>
                    {(t.resultAmount || 0) > 0 ? "+" : ""}{formatCurrency(t.resultAmount || 0)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${(t.resultR || 0) > 0 ? "text-emerald" : (t.resultR || 0) < 0 ? "text-rose" : "text-sky"}`}>
                    {t.resultR != null ? formatR(t.resultR) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Link href={`/operacoes/${t.id}`} className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-sky transition" title="Ver">
                        <Eye size={14} />
                      </Link>
                      <Link href={`/operacoes/${t.id}/editar`} className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-amber transition" title="Editar">
                        <Pencil size={14} />
                      </Link>
                      <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-rose transition disabled:opacity-40" title="Excluir">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
