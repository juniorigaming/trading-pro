"use client";
import { useState, useEffect, useRef } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Download, X, Trash2 } from "lucide-react";
type ImportedFileInfo = { name: string; size: number; importedAt: string; totalRows: number; imported: number; };
export default function CsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedFile, setImportedFile] = useState<ImportedFileInfo | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const saved = localStorage.getItem('lastImportedFile');
    if (saved) { try { setImportedFile(JSON.parse(saved)); } catch {} }
  }, []);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) { setFile(e.target.files[0]); setResult(null); setError(null); }
  };
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const formData = new FormData(); formData.append('file', file);
      const res = await fetch('/api/broker/import-csv', { method: 'POST', body: formData });
      const text = await res.text(); let data: any;
      try { data = JSON.parse(text); } catch {
        if (text.includes('<!DOCTYPE') || text.includes('<html')) throw new Error('Rota não encontrada (404). Faça git commit --allow-empty e push para forçar rebuild SEM cache no Cloudflare.');
        throw new Error(`Resposta inválida: ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(data.error || data.details || data.message || 'Falha ao importar');
      setResult(data);
      const info: ImportedFileInfo = { name: file.name, size: file.size, importedAt: new Date().toISOString(), totalRows: data.totalRows || 0, imported: data.imported || 0 };
      setImportedFile(info); localStorage.setItem('lastImportedFile', JSON.stringify(info));
      setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/trades/clear', { method: 'POST' }).catch(() => null);
      await fetch('/api/trades/clear', { method: 'DELETE' }).catch(() => null);
      setFile(null); setResult(null); setError(null); setImportedFile(null);
      localStorage.removeItem('lastImportedFile'); setShowConfirmDelete(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      window.dispatchEvent(new CustomEvent('tradesCleared'));
    } catch (e: any) { setError(`Falha ao excluir: ${e.message}`); } finally { setDeleting(false); }
  };
  const clearSelectedFile = () => { setFile(null); setResult(null); setError(null); if (fileInputRef.current) fileInputRef.current.value = ''; };
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="space-y-3">
        <input ref={fileInputRef} type="file" accept=".csv,.html,.htm,.txt" onChange={handleFileChange} className="hidden" id="csv-file-input-v28" />
        {!file && !importedFile && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted mb-2 block">Arquivo CSV ou HTML do MT5</label>
            <label htmlFor="csv-file-input-v28" className="flex items-center gap-2 px-4 py-3 bg-violet/10 border border-violet/20 border-dashed rounded-xl cursor-pointer hover:bg-violet/15 transition group">
              <Upload size={16} className="text-violet group-hover:scale-110 transition" />
              <span className="text-xs font-bold text-violet">Escolher arquivo</span>
              <span className="text-[11px] text-slate-muted">HTML ou CSV do MT5</span>
            </label>
          </div>
        )}
        {file && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted mb-2 block">Arquivo selecionado - 1 arquivo com X</label>
            <div className="bg-white/[0.05] border border-white/[0.1] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center"><FileText size={14} className="text-emerald" /></div>
                <div><p className="text-xs font-bold text-emerald">{file.name}</p><p className="text-[10px] text-slate-muted">{(file.size/1024).toFixed(1)}KB • Pronto para importar</p></div>
              </div>
              <button onClick={clearSelectedFile} className="w-7 h-7 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20 transition" title="Remover arquivo"><X size={14} className="text-rose" /></button>
            </div>
          </div>
        )}
        {importedFile && !file && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted mb-2 block">Último arquivo importado - 1 arquivo com X</label>
            <div className="bg-emerald/5 border border-emerald/20 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center"><FileText size={14} className="text-emerald" /></div>
                <div><p className="text-xs font-bold text-emerald">{importedFile.name}</p><p className="text-[10px] text-slate-muted">{(importedFile.size/1024).toFixed(1)}KB • {importedFile.imported} operações • {new Date(importedFile.importedAt).toLocaleDateString('pt-BR')}</p></div>
              </div>
              <button onClick={() => setShowConfirmDelete(true)} className="w-7 h-7 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20 transition" title="Excluir arquivo e operações"><X size={14} className="text-rose" /></button>
            </div>
          </div>
        )}
        {file && (
          <button onClick={handleUpload} disabled={loading} className="px-5 py-2.5 bg-emerald hover:bg-emerald/90 text-white text-sm font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-2">
            {loading ? 'Importando...' : 'Importar Operações'}{!loading && <Upload size={14} />}
          </button>
        )}
      </div>
      {result && (
        <div className="p-3 rounded-xl border bg-emerald/10 border-emerald/20 text-emerald text-xs flex items-start gap-2">
          <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1"><p className="font-bold">{result.message}</p><p className="mt-1 text-[11px]">Total linhas: {result.totalRows} | Importadas: {result.imported} | Ignoradas: {result.skipped}</p><p className="mt-2"><a href="/operacoes" className="underline font-bold">Ver em Operações →</a></p></div>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl border bg-rose/10 border-rose/20 text-rose text-xs flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /><span className="flex-1">{error}</span>
        </div>
      )}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/20 flex items-center justify-center"><Trash2 size={18} className="text-rose" /></div>
              <div><h4 className="text-sm font-bold text-white">Excluir operações?</h4><p className="text-[11px] text-slate-muted">Essa ação não pode ser desfeita</p></div>
            </div>
            <p className="text-xs text-slate-300">Tem certeza que quer excluir <b>{importedFile ? `"${importedFile.name}"` : 'o arquivo'}</b> e <b>todas as {importedFile?.imported || result?.imported || '7'} operações</b>?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmDelete(false)} disabled={deleting} className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition disabled:opacity-50">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 px-4 py-2.5 bg-rose hover:bg-rose/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1">{deleting ? 'Excluindo...' : 'Sim, excluir'}{!deleting && <Trash2 size={12} />}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
