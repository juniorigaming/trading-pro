import { describe, it, expect, beforeAll } from "vitest";
import { setEnvOverrides } from "@/lib/env";

// Provedor MOCK: nenhum token gasto. Sem banco: testamos a rota de OCR (não persiste) e a validação de upload.
beforeAll(() => setEnvOverrides({ AI_PROVIDER: "mock", APP_API_TOKEN: "t0k" }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("POST /api/ai/macro/extract (mock provider)", () => {
  it("exige token quando APP_API_TOKEN está definido", async () => {
    const { POST } = await import("@/app/api/ai/macro/extract/route");
    const fd = new FormData(); fd.append("images", new File([PNG], "ff.png", { type: "image/png" }));
    const res = await POST(new Request("http://x/api/ai/macro/extract", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });
  it("retorna eventos extraídos com pendentes separados de realizados", async () => {
    const { POST } = await import("@/app/api/ai/macro/extract/route");
    const fd = new FormData(); fd.append("images", new File([PNG], "ff.png", { type: "image/png" }));
    const res = await POST(new Request("http://x/api/ai/macro/extract", { method: "POST", body: fd, headers: { "x-app-token": "t0k" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    const pending = body.events.find((e: { event: string }) => e.event === "Employment Change");
    expect(pending.actual).toBeNull();
    const low = body.events.find((e: { ocr_confidence: number }) => e.ocr_confidence < 0.7);
    expect(low.requires_manual_confirmation).toBe(true);
    expect(body.meta.provider).toBe("mock");
  });
  it("rejeita tipo de arquivo inválido e excesso de imagens", async () => {
    const { POST } = await import("@/app/api/ai/macro/extract/route");
    const fd = new FormData(); fd.append("images", new File([new Uint8Array([1, 2, 3])], "x.exe", { type: "application/octet-stream" }));
    const res = await POST(new Request("http://x", { method: "POST", body: fd, headers: { "x-app-token": "t0k" } }));
    expect(res.status).toBe(415);
    const fd2 = new FormData(); for (let i = 0; i < 11; i++) fd2.append("images", new File([PNG], `${i}.png`, { type: "image/png" }));
    const res2 = await POST(new Request("http://x", { method: "POST", body: fd2, headers: { "x-app-token": "t0k" } }));
    expect(res2.status).toBe(400);
  });
});

describe("POST /api/ai/macro/analyze — validação de payload", () => {
  it("rejeita sessão inválida e moeda fora do G8 sem tocar no banco", async () => {
    const { POST } = await import("@/app/api/ai/macro/analyze/route");
    const res = await POST(new Request("http://x", { method: "POST", headers: { "x-app-token": "t0k", "content-type": "application/json" }, body: JSON.stringify({ session: "TOKYO", events: [] }) }));
    expect(res.status).toBe(400);
    const res2 = await POST(new Request("http://x", { method: "POST", headers: { "x-app-token": "t0k", "content-type": "application/json" }, body: JSON.stringify({ session: "LONDON", events: [{ date: null, time: null, currency: "BRL", event: "Selic", actual: null, forecast: null, previous: null }] }) }));
    expect(res2.status).toBe(400);
  });
});

describe("AI service — retry/validação", () => {
  it("generateStructured com mock valida pelo schema", async () => {
    const { generateStructured } = await import("@/lib/ai/service");
    const { SESSION_BRIEF } = await import("@/lib/ai/prompts");
    const r = await generateStructured({ purpose: "session_brief", prompt: SESSION_BRIEF, schemaName: "session_brief", user: "{}" });
    expect(r.provider).toBe("mock"); expect(r.data.headline).toBeTruthy(); expect(r.promptVersion).toBe("session-brief-v1");
  });
});
