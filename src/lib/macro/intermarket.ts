/** Interpretação intermarket (DXY / yields) — contexto, nunca gatilho. */
export function interpretIntermarket(s: { dxyChangePct?: number | null; us02yChangeBp?: number | null; us10yChangeBp?: number | null }): { regime: string; interpretation: string } {
  const dxyUp = (s.dxyChangePct ?? 0) > 0.1, dxyDown = (s.dxyChangePct ?? 0) < -0.1;
  const yUp = (s.us10yChangeBp ?? 0) > 2 || (s.us02yChangeBp ?? 0) > 2, yDown = (s.us10yChangeBp ?? 0) < -2 || (s.us02yChangeBp ?? 0) < -2;
  if (dxyUp && yUp) return { regime: "USD_UP_YIELDS_UP", interpretation: "DXY ↑ + yields ↑ → pressão potencial sobre XAU/NAS/BTC. Intermarket NÃO é gatilho: exigir confirmação estrutural no ativo." };
  if (dxyDown && yDown) return { regime: "USD_DOWN_YIELDS_DOWN", interpretation: "DXY ↓ + yields ↓ → vento a favor para XAU/NAS/BTC. Ainda exigir sweep + displacement + MSS no ativo." };
  if (dxyUp && yDown) return { regime: "USD_UP_YIELDS_DOWN", interpretation: "Sinais mistos (USD forte com yields caindo — possível risk-off). Peso baixo; priorizar estrutura." };
  if (dxyDown && yUp) return { regime: "USD_DOWN_YIELDS_UP", interpretation: "Sinais mistos (yields subindo sem USD). Peso baixo; priorizar estrutura." };
  return { regime: "MIXED", interpretation: "Sem direção intermarket clara. Neutro." };
}

