"use client";
import { useRef, useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Download, X, Trash2, Eye, ArrowRight, Info } from "lucide-react";
import { usePortfolio } from "@/components/PortfolioProvider";
import { invalidateTradeCaches } from "@/hooks/useTradeData";
import { PORTFOLIOS, PORTFOLIO_META, type PortfolioId } from "@/lib/portfolio";
import { formatCurrency } from "@/lib/utils";
import { FORMATS_BY_PORTFOLIO, IMPORT_FORMAT_LABEL, type ImportFormatOrAuto } from "@/lib/import/types";

type Summary = {
  success: boolean; format: string; portfolio: PortfolioId; fileName: string; totalRows: number; parsed: number; imported: number; duplicates: number; skipped: number; dryRun: boolean;
  warnings: string[]; errors: string[]; message: string; droppedColumns: string[];
  preview: Array<{ externalId: string; date: string; time: string; asset: string; direction: string; resultAmount: number; duplicate: boolean }>;
};

const HOWTO: Record<string, string[]> = {
  mt5: ["No MetaTrader 5: aba Histórico › botão direito › Relatório › HTML (Open XML).", "Selecione o período com as posições já fechadas.", "O arquivo tem a tabela 'Posições' — é ela que importamos."],
  profit: ["No Profit (Nelogica): Resumo de Operações › selecione o período › Exportar › CSV.", "Precisa das colunas Ativo, Abertura, Fechamento, Lado e Res. Operação."],
  clear: ["Clear/XP/Rico: Área logada › Extratos › Negociações (ou Área do Investidor B3 › Extrato › Negociação) › exportar CSV/Excel salvo como CSV.", "Cada linha é uma compra ou venda — o sistema casa entradas e saídas por preço médio (WIN R$0,20/pt · WDO R$10/pt)."],
  binance: ["Binance Futuros: Orders › Trade History › Export (tem a coluna 'Realized Profit').", "Alternativas: Transaction History (REALIZED_PNL) ou Spot › Trade History (casado por preço médio)."],
  bybit: ["Bybit: Orders › Derivatives › Closed P&L › Export (CSV)."],
  generic: ["Baixe o modelo, preencha uma linha por operação fechada e salve como CSV (UTF-8).", "Colunas: data, hora, ativo, direcao (BUY/SELL), quantidade, preco_entrada, preco_saida, resultado, taxas, id_externo, observacoes."],
  auto: ["O formato é detectado automaticamente pelo cabeçalho do arquivo.", "Se não reconhecer, escolha o formato manualmente ou use o CSV genérico."],
};

async function postImport(file: File, portfolio: PortfolioId, format: ImportFormatOrAuto, dryRun: boolean): Promise<Summary> {
  let lastText = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fd = new FormData();
    fd.append("file", file); fd.append("portfolio", portfolio); fd.append("format", format); if (dryRun) fd.append("dryRun", "1");
    const res = await fetch("/api/broker/import", { method: "POST", body: fd, cache: "no-store" });
    lastText = await res.text();
    let data: (Summary & { error?: string; details?: string }) | null = null;
    try { data = JSON.parse(lastText); } catch { data = null; }
    if (data) {
      if (!res.ok) throw new Error(data.error || data.details || `Erro ${res.status}`);
      return data;
    }
    const cfError = res.status >= 500 || /error code: 11\d\d|Worker threw|exceeded/i.test(lastText);
    if (cfError && attempt < 3) { await new Promise((r) => setTimeout(r, 1200 * attempt)); continue; }
    if (res.status === 404) throw new Error("Rota /api/broker/import não encontrada (404). Verifique se o deploy terminou no Cloudflare.");
    throw new Error(cfError ? "Servidor Cloudflare falhou 3 vezes seguidas. Aguarde 30s e tente de novo." : `Resposta inválida: ${lastText.slice(0, 160)}`);
  }
  throw new Error(`Sem resposta: ${lastText.slice(0, 120)}`);
}

/** Importação de operações de corretoras para qualquer carteira (Forex · B3 · Cripto). */
export default function ImportTrades({ defaultPortfolio }: { defaultPortfolio?: PortfolioId }) {
  const { portfolio: active } = usePortfolio();
  const [portfolio, setPortfolio] = useState<PortfolioId>(defaultPortfolio ?? active);
  const [format, setFormat] = useState<ImportFormatOrAuto>("auto");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | "clear" | null>(null);
  const [preview, setPreview] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<"imported" | "all" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = PORTFOLIO_META[portfolio];
  const formats = FORMATS_BY_PORTFOLIO[portfolio];

  const reset = () => { setFile(null); setPreview(null); setResult(null); setError(null); if (inputRef.current) inputRef.current.value = ""; };

  const choosePortfolio = (p: PortfolioId) => { setPortfolio(p); setFormat("auto"); setPreview(null); setResult(null); setError(null); };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f); setPreview(null); setResult(null); setError(null);
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "preview" : "import"); setError(null);
    try {
      const data = await postImport(file, portfolio, format, dryRun);
      if (dryRun) setPreview(data);
      else {
        setResult(data); setPreview(null);
        invalidateTradeCaches();
        setFile(null); if (inputRef.current) inputRef.current.value = "";
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao importar"); }
    finally { setBusy(null); }
  };

  const clear = async (scope: "imported" | "all") => {
    setBusy("clear"); setError(null);
    try {
      const res = await fetch(`/api/trades/clear?portfolio=${portfolio}&scope=${scope}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.details || `Erro ${res.status}`);
      setResult({ success: true, format: "-", portfolio, fileName: "", totalRows: 0, parsed: 0, imported: 0, duplicates: 0, skipped: 0, dryRun: false, warnings: [], errors: [], droppedColumns: [], preview: [], message: `${data.deleted ?? 0} operação(ões) ${scope === "all" ? "da carteira" : "importadas"} ${meta.label} excluídas.` });
      invalidateTradeCaches();
      window.dispatchEvent(new CustomEvent("tradesCleared"));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir"); }
    finally { setBusy(null); setConfirmClear(null); }
  };

  const newCount = preview ? preview.preview.filter((p) => !p.duplicate).length + Math.max(0, preview.parsed - preview.preview.length) : 0;

  return (
    <div className="space-y-4" id="importar">
      {/* 1. Carteira de destino */}
      <div>
        <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">1 · Carteira de destino</p>
        <div className="grid grid-cols-3 gap-2">
          {PORTFOLIOS.map((id) => {
            const m = PORTFOLIO_META[id]; const on = id === portfolio;
            return (
              <button key={id} type="button" onClick={() => choosePortfolio(id)} className={`rounded-xl border px-3 py-2.5 text-left transition ${on ? `${m.accent.bg} ${m.accent.border}` : "border-border bg-surface-2 hover:bg-surface-3"}`}>
                <p className={`text-xs font-extrabold ${on ? "text-text-primary" : "text-text-secondary"}`}>{m.label} <span className="text-[10px] text-text-muted font-semibold">· {m.currency}</span></p>
                <p className="text-[10px] text-text-muted truncate">{m.brokers.join(" · ")}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Formato + arquivo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">2 · Formato do arquivo</p>
          <select value={format} onChange={(e) => setFormat(e.target.value as ImportFormatOrAuto)} className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40">
            <option value="auto">Detectar automaticamente</option>
            {formats.map((f) => <option key={f} value={f}>{IMPORT_FORMAT_LABEL[f]}</option>)}
            <optgroup label="Outros formatos">
              {(Object.keys(IMPORT_FORMAT_LABEL) as Array<keyof typeof IMPORT_FORMAT_LABEL>).filter((f) => !formats.includes(f)).map((f) => <option key={f} value={f}>{IMPORT_FORMAT_LABEL[f]}</option>)}
            </optgroup>
          </select>
          <ul className="mt-2 space-y-1">
            {(HOWTO[format] ?? HOWTO.auto).map((l, i) => <li key={i} className="text-[11px] text-text-muted flex gap-1.5"><Info size={12} className="mt-0.5 shrink-0 text-accent" />{l}</li>)}
          </ul>
          <a href="/api/broker/import?template=1" className="inline-flex items-center gap-1.5 mt-2 text-[11px] font-bold text-sky hover:underline"><Download size={12} /> Baixar CSV modelo (genérico)</a>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-2">3 · Arquivo</p>
          <input ref={inputRef} type="file" accept=".csv,.html,.htm,.txt,.tsv" onChange={onFile} className="hidden" id="import-file-input" />
          {!file ? (
            <label htmlFor="import-file-input" className="flex flex-col items-center justify-center gap-2 px-4 py-6 border border-dashed border-accent/30 bg-accent-soft/40 rounded-xl cursor-pointer hover:bg-accent-soft transition text-center">
              <Upload size={18} className="text-accent" />
              <span className="text-xs font-bold text-accent">Escolher arquivo</span>
              <span className="text-[10px] text-text-muted">HTML (MT5) ou CSV · até 8 MB</span>
            </label>
          ) : (
            <div className="bg-surface-2 border border-border rounded-xl p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center shrink-0"><FileText size={14} className="text-emerald" /></div>
                <div className="min-w-0"><p className="text-xs font-bold text-text-primary truncate">{file.name}</p><p className="text-[10px] text-text-muted">{(file.size / 1024).toFixed(1)} KB → carteira {meta.label}</p></div>
              </div>
              <button onClick={reset} className="w-7 h-7 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20 transition shrink-0" title="Remover"><X size={12} className="text-rose" /></button>
            </div>
          )}
          {file && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => run(true)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface-3 border border-border text-text-primary text-xs font-bold rounded-xl hover:bg-surface-2 transition disabled:opacity-50">
                <Eye size={14} /> {busy === "preview" ? "Analisando..." : "Pré-visualizar"}
              </button>
              <button onClick={() => run(false)} disabled={!!busy} className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl hover:bg-accent/90 transition disabled:opacity-50 shadow-lg shadow-accent/20">
                <Upload size={14} /> {busy === "import" ? "Importando..." : `Importar para ${meta.label}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pré-visualização */}
      {preview && (
        <div className="rounded-xl border border-border bg-surface-2/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-text-primary">Pré-visualização · formato <span className="text-accent">{preview.format.toUpperCase()}</span></p>
            <p className="text-[11px] text-text-muted">{preview.parsed} lidas · <span className="text-emerald font-bold">{newCount} novas</span> · {preview.duplicates} já existentes · {preview.skipped} ignoradas</p>
          </div>
          {preview.warnings.map((w, i) => <p key={i} className="text-[11px] text-amber flex gap-1.5 mb-1"><AlertCircle size={12} className="mt-0.5 shrink-0" />{w}</p>)}
          <div className="max-h-56 overflow-auto rounded-lg border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-surface-3 text-text-muted sticky top-0"><tr><th className="text-left px-2 py-1.5 font-semibold">Data</th><th className="text-left px-2 py-1.5 font-semibold">Ativo</th><th className="text-left px-2 py-1.5 font-semibold">Lado</th><th className="text-right px-2 py-1.5 font-semibold">Resultado</th><th className="text-left px-2 py-1.5 font-semibold">Status</th></tr></thead>
              <tbody>
                {preview.preview.map((p) => (
                  <tr key={p.externalId} className={`border-t border-border/60 ${p.duplicate ? "opacity-50" : ""}`}>
                    <td className="px-2 py-1 whitespace-nowrap">{p.date.slice(0, 10)} {p.time}</td>
                    <td className="px-2 py-1 font-bold">{p.asset}</td>
                    <td className={`px-2 py-1 font-semibold ${p.direction === "BUY" ? "text-emerald" : "text-rose"}`}>{p.direction}</td>
                    <td className={`px-2 py-1 text-right tabular-nums font-bold ${p.resultAmount > 0 ? "text-emerald" : p.resultAmount < 0 ? "text-rose" : "text-text-muted"}`}>{formatCurrency(p.resultAmount, meta.currency)}</td>
                    <td className="px-2 py-1">{p.duplicate ? <span className="text-text-muted">já importada</span> : <span className="text-emerald">nova</span>}</td>
                  </tr>
                ))}
                {preview.preview.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-text-muted">Nenhuma operação encontrada.</td></tr>}
              </tbody>
            </table>
          </div>
          {newCount > 0 && (
            <button onClick={() => run(false)} disabled={!!busy} className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald text-white text-xs font-bold rounded-xl hover:bg-emerald/90 transition disabled:opacity-50">
              Confirmar importação de {newCount} operação(ões) <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {result && (
        <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${result.imported > 0 || result.message.includes("excluídas") ? "bg-emerald/10 border-emerald/20 text-emerald" : "bg-amber/10 border-amber/20 text-amber"}`}>
          <CheckCircle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{result.message}</p>
            {result.parsed > 0 && <p className="mt-1 text-[11px] opacity-80">Lidas: {result.parsed} · Importadas: {result.imported} · Duplicadas: {result.duplicates} · Ignoradas: {result.skipped}</p>}
            {result.warnings.map((w, i) => <p key={i} className="mt-1 text-[11px] opacity-80">• {w}</p>)}
            {result.errors.map((w, i) => <p key={i} className="mt-1 text-[11px] text-rose">• {w}</p>)}
          </div>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl border bg-rose/10 border-rose/20 text-rose text-xs flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{error}</span></div>
      )}

      {/* Limpeza */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
        <span className="text-[11px] text-text-muted mr-auto">Precisa recomeçar a carteira {meta.label}?</span>
        <button onClick={() => setConfirmClear("imported")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border border-border text-text-secondary hover:bg-surface-3 transition"><Trash2 size={12} /> Excluir só importadas</button>
        <button onClick={() => setConfirmClear("all")} disabled={!!busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg border border-rose/30 text-rose hover:bg-rose/10 transition"><Trash2 size={12} /> Excluir todas de {meta.label}</button>
      </div>

      {confirmClear && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/20 flex items-center justify-center"><Trash2 size={18} className="text-rose" /></div>
              <div><h4 className="text-sm font-bold text-text-primary">Excluir operações da carteira {meta.label}?</h4><p className="text-[11px] text-text-muted">Essa ação não pode ser desfeita</p></div>
            </div>
            <p className="text-xs text-text-secondary">{confirmClear === "all" ? `Todas as operações da carteira ${meta.label} (manuais e importadas) serão apagadas. As outras carteiras não são afetadas.` : `Somente as operações importadas de arquivos na carteira ${meta.label} serão apagadas. Registros manuais ficam.`}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(null)} disabled={busy === "clear"} className="flex-1 px-4 py-2.5 bg-surface-2 border border-border rounded-xl text-xs font-bold text-text-primary hover:bg-surface-3 transition">Cancelar</button>
              <button onClick={() => clear(confirmClear)} disabled={busy === "clear"} className="flex-1 px-4 py-2.5 bg-rose hover:bg-rose/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50">{busy === "clear" ? "Excluindo..." : "Sim, excluir"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
