"use client";

import { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Download, X, Trash2 } from "lucide-react";

type ImportedFileInfo = {
  name: string;
  size: number;
  importedAt: string;
  totalRows: number;
  imported: number;
};

export default function CsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedFile, setImportedFile] = useState<ImportedFileInfo | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Carrega info do último import do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('lastImportedFile');
    if (saved) {
      try {
        setImportedFile(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/broker/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.details || data.message || 'Falha ao importar');

      if (data.imported === 0 && data.totalRows > 0) {
        // Se encontrou linhas mas não importou, mostra como erro mas mantém dados
        setError(`${data.message || 'Nenhuma importada'} - ${data.errors?.[0] || ''}`);
        setResult(data);
      } else {
        setResult(data);
        // Salva info do arquivo importado
        const info: ImportedFileInfo = {
          name: file.name,
          size: file.size,
          importedAt: new Date().toISOString(),
          totalRows: data.totalRows || 0,
          imported: data.imported || 0,
        };
        setImportedFile(info);
        localStorage.setItem('lastImportedFile', JSON.stringify(info));
        // Não limpa o file, mantém visível
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Chama API para limpar trades
      const res = await fetch('/api/trades/clear', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        // Tenta DELETE direto também
        const res2 = await fetch('/api/trades/clear', { method: 'DELETE' }).catch(() => null);
      }
      
      // Limpa estados
      setFile(null);
      setResult(null);
      setError(null);
      setImportedFile(null);
      localStorage.removeItem('lastImportedFile');
      setShowConfirmDelete(false);
      
      // Recarrega página de operações se estiver nela, ou mostra mensagem
      // Dispara evento para atualizar dashboard
      window.dispatchEvent(new CustomEvent('tradesCleared'));
      
    } catch (e: any) {
      setError(`Falha ao excluir: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = `Time,Symbol,Type,Volume,Price,Profit,Ticket
2024.09.16 22:00:00,EURUSD,Buy,0.10,1.08500,15.50,123456
2024.09.16 22:15:00,GBPUSD,Sell,0.20,1.27000,-8.20,123457
2024.09.17 09:30:00,XAUUSD,Buy,0.05,2650.00,25.00,123458`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_import_dooprime.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center">
          <Upload size={16} className="text-emerald" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-text-primary">Importar Histórico CSV (Grátis - Sem MetaApi)</h3>
          <p className="text-[11px] text-slate-muted">Exporte do MT5 e importe aqui. 100% gratuito, sem pagar MetaApi.</p>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-text-primary">Como exportar do MT5 da DooPrime:</h4>
        <ol className="text-[11px] text-slate-muted space-y-1 list-decimal list-inside">
          <li>No MT5, vá em <b>Toolbox &gt; Histórico</b> (embaixo)</li>
          <li>Botão direito &gt; selecione período <b>Últimos 3 meses</b> ou <b>Todo histórico</b></li>
          <li>Botão direito &gt; <b>Relatório &gt; HTML</b> ou <b>Salvar como relatório</b></li>
          <li>Salve o arquivo HTML</li>
          <li>Volte aqui e envie o arquivo HTML ou CSV abaixo - o sistema lê os dois!</li>
          <li><b>Dica:</b> Se quiser CSV puro: abra o HTML no Excel &gt; Salvar como &gt; CSV</li>
        </ol>
      </div>

      <div className="flex gap-2">
        <button onClick={downloadTemplate} className="text-[11px] px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 flex items-center gap-1">
          <Download size={12} /> Baixar modelo CSV
        </button>
      </div>

      {/* Arquivo importado anteriormente - visível com X */}
      {importedFile && !file && (
        <div className="bg-emerald/5 border border-emerald/20 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-emerald" />
            <div>
              <p className="text-xs font-bold text-emerald">{importedFile.name}</p>
              <p className="text-[10px] text-slate-muted">
                {(importedFile.size/1024).toFixed(1)}KB • {importedFile.imported} operações • {new Date(importedFile.importedAt).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="w-7 h-7 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20 transition"
            title="Excluir arquivo e operações"
          >
            <X size={14} className="text-rose" />
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Arquivo CSV ou HTML do MT5</label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".csv,.html,.htm,.txt"
              onChange={handleFileChange}
              className="text-xs text-slate-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-violet file:text-white file:text-xs file:font-bold hover:file:bg-violet/90"
            />
            {file && (
              <div className="flex items-center gap-2 bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-1.5">
                <FileText size={12} className="text-emerald" />
                <span className="text-[11px] text-emerald font-medium">{file.name} ({(file.size/1024).toFixed(1)}KB)</span>
                <button
                  onClick={() => { setFile(null); setResult(null); setError(null); }}
                  className="ml-2 w-5 h-5 rounded bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20"
                >
                  <X size={10} className="text-rose" />
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="px-5 py-2.5 bg-emerald hover:bg-emerald/90 text-white text-sm font-bold rounded-xl transition disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? 'Importando...' : 'Importar Operações'}
          {!loading && <Upload size={14} />}
        </button>
      </div>

      {result && (
        <div className="p-3 rounded-xl border bg-emerald/10 border-emerald/20 text-emerald text-xs flex items-start gap-2">
          <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold">{result.message}</p>
            <p className="mt-1 text-[11px]">Total linhas: {result.totalRows} | Importadas: {result.imported} | Ignoradas: {result.skipped}</p>
            {result.errors && result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px]">Ver erros ({result.errors.length})</summary>
                <pre className="mt-1 text-[10px] whitespace-pre-wrap bg-black/20 p-2 rounded">{result.errors.join('\n')}</pre>
              </details>
            )}
            <p className="mt-2"><a href="/operacoes" className="underline font-bold">Ver em Operações →</a></p>
          </div>
          {/* X para excluir após importar */}
          {result.imported > 0 && (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="w-7 h-7 rounded-lg bg-rose/10 border border-rose/20 flex items-center justify-center hover:bg-rose/20 transition flex-shrink-0"
              title="Excluir operações importadas"
            >
              <X size={14} className="text-rose" />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border bg-rose/10 border-rose/20 text-rose text-xs flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/20 flex items-center justify-center">
                <Trash2 size={18} className="text-rose" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Excluir operações?</h4>
                <p className="text-[11px] text-slate-muted">Essa ação não pode ser desfeita</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-300">
              Tem certeza que quer excluir <b>{importedFile ? `"${importedFile.name}"` : 'o arquivo'}</b> e <b>todas as {importedFile?.imported || result?.imported || ''} operações</b> importadas?
            </p>
            
            <div className="bg-amber/10 border border-amber/20 rounded-xl p-2.5 text-[11px] text-amber">
              Isso vai apagar o arquivo e todas as operações do banco. Você precisará importar de novo.
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/10 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-rose hover:bg-rose/90 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {deleting ? 'Excluindo...' : 'Sim, excluir'}
                {!deleting && <Trash2 size={12} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 text-[11px] text-amber">
        <p className="font-bold">💡 Alternativa 100% grátis ao MetaApi:</p>
        <p>Enquanto não tiver saldo no MetaApi, use este import CSV. É manual (você exporta do MT5 toda semana), mas funciona e não paga nada. Quando tiver capital, pode voltar pro sync automático pagando $10 no MetaApi.</p>
      </div>
    </div>
  );
}
