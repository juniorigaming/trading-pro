"use client";
import { Info } from "lucide-react";

const THRESHOLDS = [
  { n: 100, label: "AMOSTRA RELEVANTE", cls: "text-emerald border-emerald/20 bg-emerald/10" },
  { n: 30, label: "AMOSTRA EM DESENVOLVIMENTO", cls: "text-sky border-sky/20 bg-sky/10" },
  { n: 10, label: "BAIXA CONFIABILIDADE", cls: "text-amber border-amber/20 bg-amber/10" },
  { n: 0, label: "AMOSTRA INSUFICIENTE", cls: "text-rose border-rose/20 bg-rose/10" },
];

export default function SampleSizeWarning({ n, show = true }: { n: number; show?: boolean }) {
  if (!show) return null;
  if (n >= 100) return null;
  const level = THRESHOLDS.find((t) => n >= t.n)!;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${level.cls}`}>
      <Info size={11} /> {level.label}{n < 100 ? ` · ${n} trades` : ""}
    </span>
  );
}
