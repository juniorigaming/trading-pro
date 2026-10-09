"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/ai/client";
import type { ExposureResult } from "@/lib/macro/exposure";
import { Notice, Spinner, scoreBg } from "./ui";

export default function CurrencyExposure({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ExposureResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { apiFetch<ExposureResult>("/api/portfolio/exposure").then(setData).catch((e) => setErr(e.message)); }, []);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!data) return <Spinner label="Calculando exposição..." />;
  const entries = Object.entries(data.exposure).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return (
    <div>
      {data.openTrades.length === 0 ? <p className="text-xs text-text-muted">Nenhuma posição aberta.</p> : (
        <div className="flex flex-wrap gap-1.5">{entries.map(([c, v]) => <span key={c} className={`px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums ${scoreBg(v)}`}>{c} {v > 0 ? "+" : ""}{v}</span>)}</div>
      )}
      {data.alerts.length > 0 && <div className="mt-2 space-y-1.5">{data.alerts.map((a, i) => <Notice key={i} kind={a.level === "DANGER" ? "error" : "warn"}>{a.message}</Notice>)}</div>}
      {!compact && data.correlatedGroups.length > 0 && (
        <ul className="mt-2 text-[11px] text-text-secondary space-y-0.5">{data.correlatedGroups.map((g) => <li key={g.currency}><b>{g.currency}</b> {g.side}: {g.symbols.join(", ")}</li>)}</ul>
      )}
      <p className="text-[10px] text-text-muted mt-2">{data.openTrades.length} posição(ões) aberta(s). Alerta a partir de 2 pernas na mesma moeda/direção; perigo a partir de 3.</p>
    </div>
  );
}
