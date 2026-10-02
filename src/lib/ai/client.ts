"use client";
/** Helpers de fetch do lado do browser para o módulo IA.
 *  - envia `x-app-token` (se configurado em localStorage) para rotas protegidas por APP_API_TOKEN
 *  - comprime imagens no browser (≤1600px, JPEG 0.85) antes do upload — reduz custo/latência e evita payloads grandes
 */
export const TOKEN_KEY = "app_api_token";
export function getToken(): string { if (typeof window === "undefined") return ""; return localStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(v: string) { if (typeof window !== "undefined") { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } }

export async function apiFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const t = getToken(); if (t) headers.set("x-app-token", t);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) { const d = data as { error?: string; detail?: string; issues?: unknown[] } | null; throw new Error(d?.error ? `${d.error}${d.detail ? ` — ${d.detail}` : ""}${d.issues ? ` (${JSON.stringify(d.issues).slice(0, 160)})` : ""}` : `HTTP ${res.status}`); }
  return data as T;
}

export interface LocalImage { id: string; file: File; previewUrl: string; label?: string; width?: number; height?: number }

/** Reduz imagem para no máximo `max` px no maior lado; converte para JPEG. PNG pequenos são preservados. */
export async function compressImage(file: File, max = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900_000) { bitmap.close(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d"); if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
}

export const uid = () => Math.random().toString(36).slice(2, 10);
