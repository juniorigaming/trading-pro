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
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({
    broker: "dooprime",
    accountNumber: "883112",
    server: "DooPrime-Demo",
    platform: "MT5",
    investorPassword: "",
  });
  const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

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

  const handleTestToken = async () => {
    try {
      const res = await fetch("/api/broker/test", { cache: "no-store" });
      const data = await res.json();
      setTestResult(data);
      if (data.ok) {
        setMessage({ type: "success", text: `Token OK! Tamanho ${data.tokenLen}. ${data.message}` });
      } else {
        setMessage({ type: "error", text: `Token falhou: ${data.message || data.error} (len=${data.tokenLen})` });
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    }
  };

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
      if (!res.ok) throw new Error(data.error || data.details || "Falha ao conectar");
      
      if (data.warning) {
        setMessage({ type: "warning", text: data.message });
      } else {
        setMessage({ type: "success", text: `Conta ${form.accountNumber} conectada! ${data.message || ""}` });
      }
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

  const handleDelete = async (accountId: number, accountNumber: string) => {
    if (!confirm(`Deletar conta ${accountNumber}? Você poderá reconectar depois.`)) return;
    setDeleting(accountId);
    try {
      const res = await fetch(`/api/broker/accounts?id=${accountId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao deletar");
      setMessage({ type: "success", text: `Conta ${accountNumber} deletada. Pode reconectar agora.` });
      await fetchAccounts();
    } catch (e: any) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setDeleting(null);
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
        <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${message.type === "success" ? "bg-emerald/10 border-emerald/20 text-emerald" : message.type === "warning" ? "bg-amber/10 border-amber/20 text-amber" : "bg-rose/10 border-rose/20 text-rose"}`}>
          {message.type === "success" ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
          <span className="whitespace-pre-wrap">{message.text}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleTestToken} className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10">Testar METAAPI_TOKEN</button>
        <button onClick={fetchAccounts} className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10">Recarregar lista</button>
      </div>

      {testResult && (
        <pre className="text-[10px] p-2 bg-black/30 rounded-lg overflow-auto max-h-40">{JSON.stringify(testResult, null, 2)}</pre>
      )}

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
                <p className="text-[10px] mt-1">
                  {acc.metaApiAccountId ? (
                    <span className="text-emerald">✅ MetaApi ID: {acc.metaApiAccountId.slice(0, 8)}... conectado</span>
                  ) : (
                    <span className="text-amber">⚠️ MetaApi não conectado - token inválido ou servidor/senha errados. Delete e reconecte.</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSync(acc.id)}
                  disabled={syncing === acc.id || !acc.metaApiAccountId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald/10 hover:bg-emerald/20 border border-emerald/20 text-emerald text-xs font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!acc.metaApiAccountId ? "MetaApi não conectado" : ""}
                >
                  <RefreshCw size={14} className={syncing === acc.id ? "animate-spin" : ""} />
                  {syncing === acc.id ? "Sincronizando..." : "Sincronizar"}
                </button>
                <button
                  onClick={() => handleDelete(acc.id, acc.accountNumber)}
                  disabled={deleting === acc.id}
                  className="inline-flex items-center gap-1 px-2 py-2 bg-rose/10 hover:bg-rose/20 border border-rose/20 text-rose text-xs rounded-xl transition disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center text-xs text-slate-muted">
          Nenhuma corretora conectada ainda. Conecte sua conta demo 883112 abaixo.
        </div>
      )}

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
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Servidor - copie exato do MT5</label>
            <input type="text" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary" placeholder="DooPrime-Demo" />
            <p className="text-[9px] text-slate-500">No MT5: Arquivo &gt; Abrir conta &gt; procure DooPrime e copie nome exato. Pode ser DooPrime-Demo, DooPrime-Live, DooTechnology-Demo, etc.</p>
          </div>

          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Senha de Investidor (só leitura, segura)</label>
            <input type="password" value={form.investorPassword} onChange={(e) => setForm({ ...form, investorPassword: e.target.value })} className="bg-dark-800 border border-white/5 rounded-xl px-3 py-2.5 text-sm text-text-primary" placeholder="Senha de investidor do MT5" required />
            <p className="text-[10px] text-slate-500">Use a senha de investidor (read-only): MT5 &gt; Ferramentas &gt; Opções &gt; Servidor &gt; Alterar &gt; Senha de investidor. Ela não permite operar nem sacar. Se não tem, crie uma no MT5.</p>
          </div>
        </div>

        <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 text-[11px] text-amber space-y-1">
          <p className="font-bold">⚠️ Checklist antes de conectar:</p>
          <p>1. <code className="bg-black/30 px-1 rounded">METAAPI_TOKEN</code> no Cloudflare é Secret com token COMPLETO (700+ caracteres, sem ...). Teste com botão "Testar METAAPI_TOKEN" acima.</p>
          <p>2. Servidor exato igual MT5 mostra. Se falhar, tente: DooPrime-Demo, DooTechnology-Demo, DooPrime-Live-2, etc.</p>
          <p>3. Senha de investidor, não a master.</p>
        </div>

        <button type="submit" disabled={connecting} className="w-full md:w-auto px-5 py-2.5 bg-violet hover:bg-violet/90 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">
          {connecting ? "Conectando..." : "Conectar Conta DooPrime"}
        </button>
      </form>
    </div>
  );
}
