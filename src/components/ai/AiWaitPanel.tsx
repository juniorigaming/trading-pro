"use client";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";

/**
 * Painel de espera para operações de IA (OCR dos screenshots, análise da sessão).
 * Mostra uma mensagem clara ("Aguarde, estamos analisando as informações"),
 * a etapa atual do pipeline, uma barra de progresso e o tempo decorrido —
 * assim o usuário sabe que o app está trabalhando e não travou.
 */
export default function AiWaitPanel({
  title = "Aguarde, estamos analisando as informações",
  steps,
  note,
}: {
  title?: string;
  steps: string[];
  note?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Avança uma etapa a cada ~6s, parando na última (a conclusão real troca a tela).
  const activeStep = Math.min(Math.floor(elapsed / 6), steps.length - 1);
  // Passou do tempo típico: avisa honestamente em vez de deixar o usuário no escuro.
  const slow = elapsed >= 75;
  // Progresso simulado: sobe rápido no início e desacelera, sem nunca chegar a 100%.
  const pct = Math.min(94, 10 + Math.round(84 * (1 - Math.exp(-elapsed / 14))));

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-card border border-accent/30 bg-accent-soft/40 p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <span className="absolute inset-0 rounded-xl bg-accent/20 animate-ping" />
          <div className="relative w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Loader2 size={20} className="text-accent animate-spin" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-text-primary">{title}</p>
            <span className="text-[11px] font-semibold text-text-muted tabular-nums">
              {elapsed}s
            </span>
          </div>

          <p className="text-xs text-text-secondary mt-1">
            {steps[activeStep]}
            <span className="inline-flex ml-0.5">
              <span className="animate-pulse">.</span>
              <span className="animate-pulse [animation-delay:150ms]">.</span>
              <span className="animate-pulse [animation-delay:300ms]">.</span>
            </span>
          </p>

          {/* Barra de progresso */}
          <div className="mt-3 h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-1000 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Etapas do pipeline */}
          <ul className="mt-3 grid gap-1.5">
            {steps.map((s, i) => (
              <li
                key={s}
                className={`flex items-center gap-2 text-[11px] transition-colors ${
                  i < activeStep
                    ? "text-emerald"
                    : i === activeStep
                      ? "text-text-primary font-semibold"
                      : "text-text-muted/60"
                }`}
              >
                {i < activeStep ? (
                  <Check size={12} className="shrink-0" />
                ) : i === activeStep ? (
                  <Loader2 size={12} className="shrink-0 animate-spin" />
                ) : (
                  <span className="w-3 h-3 shrink-0 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  </span>
                )}
                <span className="truncate">{s}</span>
              </li>
            ))}
          </ul>

          <p className={`text-[11px] mt-3 ${slow ? "text-amber" : "text-text-muted"}`}>
            {slow
              ? "A IA está demorando mais que o normal (provedor sob carga). A análise continua rodando e seus eventos já estão salvos — não feche nem atualize a página."
              : (note ?? "Isso pode levar alguns segundos. Não feche nem atualize a página.")}
          </p>
        </div>
      </div>
    </div>
  );
}
