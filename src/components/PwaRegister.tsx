"use client";
import { useEffect } from "react";

/** Registra o service worker progressivamente; não guarda respostas autenticadas/API. */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[PWA] Service Worker indisponível:", e));
  }, []);
  return null;
}
