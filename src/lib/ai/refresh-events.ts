"use client";

export const AI_DATA_UPDATED_EVENT = "trading-pro:ai-data-updated";
const STORAGE_KEY = "trading-pro:ai-data-updated-at";

/** Notifica widgets e páginas já abertas, inclusive em outras abas do navegador. */
export function announceAiDataUpdated() {
  if (typeof window === "undefined") return;
  const updatedAt = new Date().toISOString();
  try { window.localStorage.setItem(STORAGE_KEY, updatedAt); } catch { /* armazenamento pode estar bloqueado */ }
  window.dispatchEvent(new Event(AI_DATA_UPDATED_EVENT));
}

/** Atualiza ao receber uma nova análise e ao voltar para a aba do navegador. */
export function subscribeAiDataUpdated(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) handler();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") handler();
  };
  window.addEventListener(AI_DATA_UPDATED_EVENT, handler);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener(AI_DATA_UPDATED_EVENT, handler);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
