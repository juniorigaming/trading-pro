"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X, ClipboardPaste } from "lucide-react";
import { compressImage, uid, type LocalImage } from "@/lib/ai/client";
import { selectCls } from "./ui";

interface Props {
  images: LocalImage[];
  onChange: (imgs: LocalImage[]) => void;
  max?: number;
  labels?: readonly string[]; // se informado, cada imagem recebe um rótulo (ex.: timeframe)
  labelTitle?: string;
  hint?: string;
  maxPx?: number; // lado maior após compressão (padrão 1600)
}

/** Área de upload com drag-and-drop, clique e Ctrl+V. Comprime no browser (≤1600px JPEG). */
export default function ImageDropzone({ images, onChange, max = 10, labels, labelTitle = "Rótulo", hint, maxPx = 1600 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = useCallback(async (files: File[]) => {
    setErr(null);
    const imgs = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    if (imgs.length !== files.length) setErr("Apenas PNG, JPEG ou WebP são aceitos.");
    if (!imgs.length) return;
    if (images.length + imgs.length > max) { setErr(`Máximo de ${max} imagens.`); return; }
    setBusy(true);
    try {
      const out: LocalImage[] = [];
      for (const f of imgs) {
        const c = await compressImage(f, maxPx);
        if (c.size > 6 * 1024 * 1024) { setErr(`${f.name}: maior que 6MB após compressão.`); continue; }
        out.push({ id: uid(), file: c, previewUrl: URL.createObjectURL(c), label: labels ? labels[Math.min(images.length + out.length, labels.length - 1)] : undefined });
      }
      onChange([...images, ...out]);
    } finally { setBusy(false); }
  }, [images, max, labels, onChange, maxPx]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) { e.preventDefault(); void addFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const remove = (id: string) => { const img = images.find((i) => i.id === id); if (img) URL.revokeObjectURL(img.previewUrl); onChange(images.filter((i) => i.id !== id)); };
  const setLabel = (id: string, label: string) => onChange(images.map((i) => (i.id === id ? { ...i, label } : i)));
  const move = (idx: number, dir: -1 | 1) => { const j = idx + dir; if (j < 0 || j >= images.length) return; const arr = [...images]; [arr[idx], arr[j]] = [arr[j], arr[idx]]; onChange(arr); };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50 hover:bg-surface-2"}`}
      >
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => { void addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
        <ImagePlus size={28} className="mx-auto text-accent mb-2" />
        <p className="text-sm font-semibold text-text-primary">Arraste os screenshots aqui, clique para selecionar ou <span className="inline-flex items-center gap-1 text-accent"><ClipboardPaste size={13} />cole com Ctrl+V</span></p>
        <p className="text-[11px] text-text-muted mt-1">{hint ?? `PNG/JPEG/WebP · até ${max} imagens · comprimidas automaticamente para ≤1600px`}{busy ? " · processando..." : ""}</p>
      </div>
      {err && <p className="text-xs text-rose mt-2">{err}</p>}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
          {images.map((img, idx) => (
            <div key={img.id} className="relative rounded-xl overflow-hidden border border-border bg-surface-2 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt={img.file.name} className="w-full h-28 object-cover" />
              <button onClick={() => remove(img.id)} className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition" aria-label="Remover"><X size={12} /></button>
              <div className="p-1.5 flex items-center gap-1">
                <span className="text-[10px] text-text-muted shrink-0">#{idx + 1}</span>
                {labels ? (
                  <select value={img.label} onChange={(e) => setLabel(img.id, e.target.value)} className={`${selectCls} flex-1 py-0.5`} title={labelTitle}>
                    {labels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                ) : <span className="text-[10px] text-text-secondary truncate flex-1" title={img.file.name}>{img.file.name}</span>}
                <button onClick={() => move(idx, -1)} className="text-[10px] text-text-muted hover:text-text-primary px-1" title="Mover para a esquerda">◀</button>
                <button onClick={() => move(idx, 1)} className="text-[10px] text-text-muted hover:text-text-primary px-1" title="Mover para a direita">▶</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
