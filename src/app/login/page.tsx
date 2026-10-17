"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, LogIn, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const requestedNext = params.get("next") || "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { enabled: boolean; authenticated: boolean }) => {
        setEnabled(d.enabled);
        if (!d.enabled || d.authenticated) router.replace(next.startsWith("/") ? next : "/");
      })
      .catch(() => setEnabled(true));
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setError(d.error || "Falha ao entrar"); return; }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Lock size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">Trading Pro</h1>
            <p className="text-xs text-text-muted">Área privada — informe a senha de acesso</p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-muted">Senha</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-2 border border-border text-text-primary rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="••••••••"
          />
        </label>

        {error && <p className="text-xs text-rose">{error}</p>}
        {enabled === false && <p className="text-xs text-amber">Proteção por senha desligada — redirecionando…</p>}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:opacity-90 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition"
        >
          <LogIn size={16} /> {loading ? "Entrando…" : "Entrar"}
        </button>

        <p className="text-[11px] text-text-muted flex items-center gap-1.5">
          <ShieldCheck size={12} /> Sessão válida por 30 dias neste navegador.
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
