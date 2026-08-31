import type { SentinelConfig } from "@sayan-sentinel/config";
import type { AIProvider } from "../provider";
import { AnthropicProvider } from "./anthropic.provider";
import { LocalOpenAICompatibleProvider } from "./local.provider";
import { OpenAIProvider } from "./openai.provider";

/**
 * Returns null — never a fake or partially-configured provider — when AI
 * isn't enabled (Section 41: deterministic scanning must remain useful
 * without an AI provider; Section 43: "AI provider unavailable —
 * deterministic analysis completed successfully", not a crash).
 */
export function createProviderFromConfig(config: SentinelConfig): AIProvider | null {
  if (!config.features.aiEnabled) return null;

  switch (config.env.AI_PROVIDER) {
    case "anthropic":
      return config.env.ANTHROPIC_API_KEY
        ? new AnthropicProvider(config.env.ANTHROPIC_API_KEY)
        : null;
    case "openai":
      return config.env.OPENAI_API_KEY ? new OpenAIProvider(config.env.OPENAI_API_KEY) : null;
    case "local":
      return config.env.LOCAL_AI_BASE_URL
        ? new LocalOpenAICompatibleProvider(config.env.LOCAL_AI_BASE_URL)
        : null;
    default:
      return null;
  }
}
