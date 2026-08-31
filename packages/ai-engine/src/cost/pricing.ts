/**
 * Approximate USD price per 1M tokens, by model. These drift as providers
 * change pricing — this table exists so cost tracking has *a* number to
 * work with, not as a claim of billing accuracy. Unknown models fall back
 * to DEFAULT_PRICING rather than throwing, so a new/renamed model doesn't
 * break scanning — it just estimates conservatively.
 */
export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  "claude-opus-5": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  "claude-sonnet-5": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  "claude-haiku-4-5": { inputPerMillionUsd: 0.8, outputPerMillionUsd: 4 },
  "gpt-5.5": { inputPerMillionUsd: 5, outputPerMillionUsd: 15 },
  "gpt-5.5-mini": { inputPerMillionUsd: 0.5, outputPerMillionUsd: 2 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillionUsd: 5, outputPerMillionUsd: 15 };

export function getModelPricing(model: string): ModelPricing {
  return PRICING_TABLE[model] ?? DEFAULT_PRICING;
}

export function estimateCostUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const pricing = getModelPricing(model);
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
}
