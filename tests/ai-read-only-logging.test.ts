import { afterEach, describe, expect, it, vi } from "vitest";
import { MACRO_MARKET_ANALYSIS } from "@/lib/ai/prompts";
import { setAICallLogger, generateStructured } from "@/lib/ai/service";
import { setEnvOverrides } from "@/lib/env";

afterEach(() => {
  setAICallLogger(null);
  setEnvOverrides(null);
});

describe("read-only macro market analysis", () => {
  it("does not write ai_calls even if another route already wired the audit logger", async () => {
    const logger = vi.fn(async () => undefined);
    setAICallLogger(logger);
    setEnvOverrides({ AI_PROVIDER: "mock" });

    const result = await generateStructured({
      purpose: "macro_market_analysis",
      logCall: false,
      prompt: MACRO_MARKET_ANALYSIS,
      schemaName: "macro_market_analysis",
      user: JSON.stringify({ currentRankingAvailable: false }),
    });

    expect(result.provider).toBe("mock");
    expect(logger).not.toHaveBeenCalled();
  });

  it("keeps audit logging enabled by default for existing AI flows", async () => {
    const logger = vi.fn(async () => undefined);
    setAICallLogger(logger);
    setEnvOverrides({ AI_PROVIDER: "mock" });

    await generateStructured({
      purpose: "existing_ai_flow",
      prompt: MACRO_MARKET_ANALYSIS,
      schemaName: "macro_market_analysis",
      user: JSON.stringify({ currentRankingAvailable: false }),
    });

    expect(logger).toHaveBeenCalledOnce();
  });
});
