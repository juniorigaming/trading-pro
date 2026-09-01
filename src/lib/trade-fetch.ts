import { Trade } from "./types";

// Erro específico para "não existe" (404). O retry NÃO é aplicado neste caso.
export class TradeNotFoundError extends Error {
  constructor() {
    super("Operação não encontrada");
    this.name = "TradeNotFoundError";
  }
}

// Busca uma operação por id com tolerância à instabilidade do banco.
// O Neon (free tier) pode "piscar" e devolver 500/1101 em parte das chamadas;
// aqui tentamos algumas vezes, com pequeno backoff, e distinguimos 404 de 500.
export async function fetchTrade(id: string | number): Promise<Trade> {
  const attempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(`/api/trades/${id}?t=${Date.now()}`, { cache: "no-store" });

      if (res.status === 404) {
        throw new TradeNotFoundError();
      }
      if (!res.ok) {
        // 500 / 1101 transitório — tenta de novo
        lastError = new Error("Falha ao carregar a operação. Tente novamente.");
        await sleep(400 * (attempt + 1));
        continue;
      }
      return (await res.json()) as Trade;
    } catch (e) {
      if (e instanceof TradeNotFoundError) throw e;
      lastError = e instanceof Error ? e : new Error("Erro desconhecido ao carregar a operação.");
      if (attempt === attempts - 1) break;
      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError ?? new Error("Falha ao carregar a operação.");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
