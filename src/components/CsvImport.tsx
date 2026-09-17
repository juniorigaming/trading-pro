"use client";

import { useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, Download } from "lucide-react";

export default function CsvImport() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (!res.ok) throw new Error(data.error || data.details || 'Falha ao importar');

      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
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

      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-muted">Arquivo CSV ou HTML do MT5</label>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv,.html,.htm,.txt"
              onChange={handleFileChange}
              className="text-xs text-slate-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-violet file:text-white file:text-xs file:font-bold hover:file:bg-violet/90"
            />
            {file && <span className="text-[11px] text-emerald flex items-center gap-1"><FileText size={12} /> {file.name} ({(file.size/1024).toFixed(1)}KB)</span>}
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
          <div>
            <p className="font-bold">{result.message}</p>
            <p className="mt-1 text-[11px]">Formato detectado: {result.format} | Total linhas: {result.totalRows} | Importadas: {result.imported} | Ignoradas: {result.skipped}</p>
            {result.errors && result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">Ver erros ({result.errors.length})</summary>
                <pre className="mt-1 text-[10px] whitespace-pre-wrap">{result.errors.join('\n')}</pre>
              </details>
            )}
            <p className="mt-2"><a href="/operacoes" className="underline">Ver em Operações →</a></p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border bg-rose/10 border-rose/20 text-rose text-xs flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-amber/10 border border-amber/20 rounded-xl p-3 text-[11px] text-amber">
        <p className="font-bold">💡 Alternativa 100% grátis ao MetaApi:</p>
        <p>Enquanto não tiver saldo no MetaApi, use este import CSV. É manual (você exporta do MT5 toda semana), mas funciona e não paga nada. Quando tiver capital, pode voltar pro sync automático pagando $10 no MetaApi.</p>
      </div>
    </div>
  );
}
