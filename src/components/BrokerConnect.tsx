"use client";

import { useEffect, useState } from "react";
import { Link2, RefreshCw, CheckCircle, AlertCircle, Trash2 } from "lucide-react";

interface BrokerAccount {
  id: number;
  broker: string;
  accountNumber: string;
  server: string;
  platform: string;
  isActive: boolean;
  lastSyncAt: string | null;
  balance: string | null;
  equity: string | null;
  metaApiAccountId: string | null;
}

export default function BrokerConnect() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [form, setForm] = useState({
    broker: "dooprime",
    accountNumber: "883112",
    server: "DooPrime-Demo",
    platform: "MT5",
    investorPassword: "",
  });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/broker/accounts", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data)) setAccounts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao conectar");
      setMessage({ type: "success", text: `Conta ${form.accountNumber} conectada! ${data.message || ""}` });
      setForm({ ...form, investorPassword: "" });
      await fetchAccounts();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (accountId: number) => {
    setSyncing(accountId);
    setMessage(null);
    try {
      const res = await fetch("/api/broker/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Falha no sync");
      setMessage({ type: "success", text: `Sync OK! ${data.imported} novas operações importadas, ${data.skipped} já existiam. Saldo: $${data.balance}` });
      await fetchAccounts();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center">
          <Link2 size={16} className="text-violet" />
        </div>
        <div>
          <h3 className="text-base font-bold text-text-primary">Corretoras Conectadas</h3>
          <p className="text-xs text-slate-muted">Conecte sua conta DooPrime para puxar operações automaticamente</p>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${message.type === "success" ? "bg-emerald/10 border-emerald/20 text-emerald" : "bg-rose/10 border-rose/20 text-rose"}`}>
          {message.type === "success" ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Lista de contas conectadas */}
      {loading ? (
        <div className="p-4 text-center text-xs text-slate-muted">Carregando contas...</div>
      ) : accounts.length > 0 ? (
        <div className="grid gap-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div>
                <p className="text-sm font-bold text-text-primary">{acc.broker.toUpperCase()} - {acc.accountNumber} <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 ml-2">{acc.platform} {acc.server}</span></p>
                <p className="text-[11px] text-slate-muted mt-1">
                  Saldo: {acc.balance ? `$${acc.balance}` : "—"} | Equity: {acc.equity ? `$${acc.equity}` : "—"} | Último sync: {acc.lastSyncAt ? new Date(acc.lastSyncAt).toLocaleString("pt-BR") : "nunca"}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">MetaApi ID: {acc.metaApiAccountId ? `${acc.metaApiAccountId.slice(0, 8)}...` : "não configurado (falta METAAPI_TOKEN)"}</p>
              </div>
              <button
                onClick={() => handleSync(acc.id)}
                disabled={syncing === acc.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald/10 hover:bg-emerald/20 border border-emerald/20 text-emerald text-xs font-bold rounded-xl transition disabled:opacity-50"
              >
                <RefreshCw size={14} className={syncing === acc.id ? "animate-spin" : ""} />
                {syncing === acc.id ? "Sincronizando..." : "Sincronizar"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-slate-muted">
          Nenhuma corretora conectada ainda. Conecte sua conta demo 883112 abaixo.
        </div>
      )}

      {/* Formulário conectar */}
      <form onSubmit={handleConnect} className="glass-card p-5 space-y-4">
        <h4 className="text-sm font-bold text-text-primary">Conectar DooPrime (Demo 883112)</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Corretora</label>
            <select value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary">
              <option value="dooprime">DooPrime</option>
              <option value="binance">Binance</option>
              <option value="bybit">Bybit</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Plataforma</label>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary">
              <option value="MT5">MT5</option>
              <option value="MT4">MT4</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Número da Conta</label>
            <input type="text" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary" placeholder="883112" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Servidor</label>
            <input type="text" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary" placeholder="DooPrime-Demo" />
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Senha de Investidor (só leitura, segura)</label>
            <input type="password" value={form.investorPassword} onChange={(e) => setForm({ ...form, investorPassword: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary" placeholder="Senha de investidor do MT5" required />
            <p className="text-[10px] text-slate-500">Use a senha de investidor (read-only) do MT5: no MT5 vá em Ferramentas &gt; Opções &gt; Servidor &gt; Alterar &gt; Senha de investidor. Ela não permite operar nem sacar.</p>
          </div>
        </div>

        <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 text-[11px] text-amber">
          <p className="font-bold">⚠️ Para sync automático funcionar, configure no Cloudflare:</p>
          <p>Dashboard &gt; Workers & Pages &gt; trading-pro &gt; Settings &gt; Variables &gt; Add variable:</p>
          <p><code className="bg-black/30 px-1 rounded">METAAPI_TOKEN</code> = seu token do https://metaapi.cloud (grátis) </p>
          <p><code className="bg-black/30 px-1 rounded">ENCRYPTION_KEY</code> = uma frase secreta de 32 caracteres pra criptografar senhas</p>
        </div>

        <button type="submit" disabled={connecting} className="w-full md:w-auto px-5 py-2.5 bg-violet hover:bg-violet/90 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">
          {connecting ? "Conectando..." : "Conectar Conta DooPrime"}
        </button>
      </form>
    </div>
  );
}
