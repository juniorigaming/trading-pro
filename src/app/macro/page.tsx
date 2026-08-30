"use client";
import { useEffect, useMemo, useState } from "react";
import { Globe, Save, TrendingUp, TrendingDown, Minus, LayoutGrid, CalendarDays, Landmark, DollarSign } from "lucide-react";
import { useTrades } from "@/hooks/useTradeData";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
const BIAS_OPTS = ["Bullish", "Neutral", "Bearish"];
const NEUTRAL_OPTS = ["Hawkish", "Neutral", "Dovish"];
const STRONG_OPTS = ["Strong", "Neutral", "Weak"];
const YIELD_OPTS = ["Up", "Neutral", "Down"];

interface Card {
  currency: string;
  bias: string;
  score: number;
  inflation: string;
  employment: string;
  activity: string;
  centralBank: string;
  yieldDirection: string;
  dxy: string;
}

const defaultCard = (c: string): Card => ({ currency: c, bias: "Neutro", score: 0, inflation: "Neutral", employment: "Neutral", activity: "Neutral", centralBank: "Neutral", yieldDirection: "Neutral", dxy: "Neutral" });

function BiasTag({ v }: { v: string }) {
  const up = v === "Bullish" || v === "Hawkish" || v === "Strong" || v === "Up";
  const down = v === "Bearish" || v === "Dovish" || v === "Weak" || v === "Down";
  const I = up ? TrendingUp : down ? TrendingDown : Minus;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? "text-emerald" : down ? "text-rose" : "text-text-muted"}`}><I size={12} />{v}</span>;
}

export default function MacroPage() {
  const { trades } = useTrades();
  const [tab, setTab] = useState<"overview" | "daily" | "intermarket">("overview");
  const [cards, setCards] = useState<Card[]>(CURRENCIES.map(defaultCard));
  const [biases, setBiases] = useState<Record<string, never>[]>([]);
  const [savingCard, setSavingCard] = useState(false);
  const [daily, setDaily] = useState({
    date: new Date().toISOString().split("T")[0],
    currency: "USD",
    session: "Nova York",
    inflation: "Neutral",
    employment: "Neutral",
    activity: "Neutral",
    centralBank: "Neutral",
    yields: "Neutral",
    dxy: "Neutral",
    biasFinal: "Neutro",
    conviction: 5,
    thesis: "",
    invalidation: "",
  });

  useEffect(() => {
    fetch("/api/macro").then((r) => r.json()).then((data) => {
      if (data.cards?.length) setCards(CURRENCIES.map((c) => data.cards.find((x: Card) => x.currency === c) || defaultCard(c)));
      if (data.biases?.length) setBiases(data.biases);
    });
  }, []);

  const updateCard = (i: number, patch: Partial<Card>) => {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  const saveCard = async (card: Card) => {
    setSavingCard(true);
    await fetch("/api/macro", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "card", data: card }) });
    setSavingCard(false);
  };

  const saveDaily = async () => {
    await fetch("/api/macro", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "daily", data: daily }) });
    const r = await fetch("/api/macro").then((r) => r.json());
    if (r.biases) setBiases(r.biases);
    setDaily({ ...daily, thesis: "", invalidation: "" });
  };

  const intermarket = useMemo(() => {
    const dxy = trades.filter((t) => t.dxyBias);
    const us02y = trades.filter((t) => t.us02y);
    const us10y = trades.filter((t) => t.us10y);
    const confirm = trades.filter((t) => t.intermarketConfirm);
    const count = (arr: unknown[], key: string) => {
      const m = new Map<string, number>();
      arr.forEach((t) => {
        const v = (t as Record<string, string>)[key];
        if (v) m.set(v, (m.get(v) || 0) + 1);
      });
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };
    return { dxy: count(dxy, "dxyBias"), us02y: count(us02y, "us02y"), us10y: count(us10y, "us10y"), confirm: count(confirm, "intermarketConfirm") };
  }, [trades]);

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: LayoutGrid },
    { id: "daily" as const, label: "Daily Bias", icon: CalendarDays },
    { id: "intermarket" as const, label: "DXY & Yields", icon: Landmark },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6 md:mb-8">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center"><Globe size={20} className="text-accent" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-text-primary tracking-tight">Macro Journal</h1>
            <p className="text-sm text-text-muted mt-0.5">Análise macro registrada por você — o score representa seu julgamento, não o preço.</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold whitespace-nowrap transition ${tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:text-text-primary hover:bg-surface-2"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((card, i) => (
            <div key={card.currency} className="glass-card-strong p-5 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-extrabold text-text-primary">{card.currency}</h3>
                <select value={card.bias} onChange={(e) => updateCard(i, { bias: e.target.value })} className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs font-bold cursor-pointer">
                  {BIAS_OPTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
              <BiasTag v={card.bias} />
              <div className="mt-2 mb-3">
                <div className="flex justify-between text-[10px] text-text-muted mb-1"><span>Score</span><span className="font-bold text-text-primary">{card.score > 0 ? "+" : ""}{card.score}</span></div>
                <input type="range" min={-100} max={100} value={card.score} onChange={(e) => updateCard(i, { score: Number(e.target.value) })} className="w-full accent-[var(--user-accent)]" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <Mini label="Inflação" value={card.inflation} onChange={(v) => updateCard(i, { inflation: v })} opts={NEUTRAL_OPTS} />
                <Mini label="Emprego" value={card.employment} onChange={(v) => updateCard(i, { employment: v })} opts={STRONG_OPTS} />
                <Mini label="Atividade" value={card.activity} onChange={(v) => updateCard(i, { activity: v })} opts={STRONG_OPTS} />
                <Mini label="Banco Central" value={card.centralBank} onChange={(v) => updateCard(i, { centralBank: v })} opts={NEUTRAL_OPTS} />
                <Mini label="Yields" value={card.yieldDirection} onChange={(v) => updateCard(i, { yieldDirection: v })} opts={YIELD_OPTS} />
                <Mini label="DXY" value={card.dxy} onChange={(v) => updateCard(i, { dxy: v })} opts={BIAS_OPTS} />
              </div>
              <button onClick={() => saveCard(card)} disabled={savingCard} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent-soft text-accent text-[11px] font-bold rounded-lg hover:bg-accent/20 transition"><Save size={12} /> Salvar</button>
            </div>
          ))}
        </div>
      )}

      {/* DAILY BIAS */}
      {tab === "daily" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card-strong p-5 md:p-6">
            <h2 className="text-base font-bold text-text-primary mb-4">Registrar Viés Diário</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Input label="Data" type="date" value={daily.date} onChange={(v) => setDaily({ ...daily, date: v })} />
              <Sel label="Moeda" value={daily.currency} onChange={(v) => setDaily({ ...daily, currency: v })} opts={CURRENCIES} />
              <Sel label="Sessão" value={daily.session} onChange={(v) => setDaily({ ...daily, session: v })} opts={["Ásia", "Londres", "Nova York"]} />
              <Sel label="Inflação" value={daily.inflation} onChange={(v) => setDaily({ ...daily, inflation: v })} opts={NEUTRAL_OPTS} />
              <Sel label="Emprego" value={daily.employment} onChange={(v) => setDaily({ ...daily, employment: v })} opts={STRONG_OPTS} />
              <Sel label="Atividade" value={daily.activity} onChange={(v) => setDaily({ ...daily, activity: v })} opts={STRONG_OPTS} />
              <Sel label="Banco Central" value={daily.centralBank} onChange={(v) => setDaily({ ...daily, centralBank: v })} opts={NEUTRAL_OPTS} />
              <Sel label="Yields" value={daily.yields} onChange={(v) => setDaily({ ...daily, yields: v })} opts={YIELD_OPTS} />
              <Sel label="DXY" value={daily.dxy} onChange={(v) => setDaily({ ...daily, dxy: v })} opts={BIAS_OPTS} />
              <Sel label="Bias Final" value={daily.biasFinal} onChange={(v) => setDaily({ ...daily, biasFinal: v })} opts={BIAS_OPTS} />
            </div>
            <div className="mb-4">
              <p className="text-[10px] text-text-muted uppercase font-semibold mb-1.5">Convicção ({daily.conviction}/10)</p>
              <input type="range" min={1} max={10} value={daily.conviction} onChange={(e) => setDaily({ ...daily, conviction: Number(e.target.value) })} className="w-full accent-[var(--user-accent)]" />
            </div>
            <textarea placeholder="Tese" value={daily.thesis} onChange={(e) => setDaily({ ...daily, thesis: e.target.value })} rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 mb-3 resize-none" />
            <textarea placeholder="Invalidação" value={daily.invalidation} onChange={(e) => setDaily({ ...daily, invalidation: e.target.value })} rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/40 mb-4 resize-none" />
            <button onClick={saveDaily} className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-bold rounded-xl transition active:scale-[0.98]"><Save size={15} /> Salvar Viés</button>
          </div>
          <div className="glass-card-strong p-5 md:p-6">
            <h2 className="text-base font-bold text-text-primary mb-4">Histórico de Viés</h2>
            {biases.length === 0 ? <p className="text-xs text-text-muted text-center py-8">Nenhum viés registrado ainda.</p> : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {biases.map((b, i) => (
                  <div key={i} className="glass-card p-3 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-bold text-text-primary">{b.currency} · {b.date} <span className="text-text-muted font-medium">/ {b.session}</span></p>
                      <BiasTag v={b.biasFinal} />
                    </div>
                    <p className="text-[11px] text-text-muted">Convicção: {b.conviction}/10</p>
                    {b.thesis && <p className="text-[11px] text-text-secondary mt-1">Tese: {b.thesis}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DXY & YIELDS */}
      {tab === "intermarket" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <IntermarketCard title="DXY Bias (trades USD)" data={intermarket.dxy} />
          <IntermarketCard title="US02Y" data={intermarket.us02y} />
          <IntermarketCard title="US10Y" data={intermarket.us10y} />
          <IntermarketCard title="Intermarket Confirm" data={intermarket.confirm} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-1.5 py-1 text-[10px] text-text-primary cursor-pointer">
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Input({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-text-muted uppercase font-semibold">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary" />
    </label>
  );
}

function Sel({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: string[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-text-muted uppercase font-semibold">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer">
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function IntermarketCard({ title, data }: { title: string; data: [string, number][] }) {
  return (
    <div className="glass-card-strong p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center"><DollarSign size={16} className="text-accent" /></div>
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
      </div>
      {data.length === 0 ? <p className="text-xs text-text-muted text-center py-6">Sem dados registrados.</p> : (
        <div className="space-y-2">
          {data.map(([k, n]) => (
            <div key={k} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-border text-xs">
              <span className="text-text-secondary">{k}</span>
              <span className="font-bold text-text-primary">{n}×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
