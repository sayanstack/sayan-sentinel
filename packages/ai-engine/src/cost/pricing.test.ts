import { describe, expect, it } from "vitest";
import { estimateCostUsd, getModelPricing } from "./pricing";

describe("getModelPricing", () => {
  it("returns known pricing for a recognized model", () => {
    const pricing = getModelPricing("claude-sonnet-5");
    expect(pricing.inputPerMillionUsd).toBeGreaterThan(0);
  });

  it("falls back to default pricing for an unrecognized model rather than throwing", () => {
    expect(() => getModelPricing("some-future-model-xyz")).not.toThrow();
  });
});

describe("estimateCostUsd", () => {
  it("scales linearly with token count", () => {
    const oneX = estimateCostUsd("claude-sonnet-5", { inputTokens: 1000, outputTokens: 0 });
    const twoX = estimateCostUsd("claude-sonnet-5", { inputTokens: 2000, outputTokens: 0 });
    expect(twoX).toBeCloseTo(oneX * 2);
  });

  it("returns 0 for zero usage", () => {
    expect(estimateCostUsd("claude-sonnet-5", { inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("prices output tokens higher than input tokens for a typical model", () => {
    const inputCost = estimateCostUsd("claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 0 });
    const outputCost = estimateCostUsd("claude-sonnet-5", { inputTokens: 0, outputTokens: 1_000_000 });
    expect(outputCost).toBeGreaterThan(inputCost);
  });
});
