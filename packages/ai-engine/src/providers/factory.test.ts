import { loadConfig } from "@sayan-sentinel/config";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "./anthropic.provider";
import { createProviderFromConfig } from "./factory";
import { LocalOpenAICompatibleProvider } from "./local.provider";
import { OpenAIProvider } from "./openai.provider";

const baseEnv = {
  DATABASE_URL: "postgresql://sentinel:sentinel@localhost:5432/sentinel",
  REDIS_URL: "redis://localhost:6379",
};

describe("createProviderFromConfig", () => {
  it("returns null (never a fake provider) when AI_PROVIDER is 'none'", () => {
    const config = loadConfig(baseEnv);
    expect(createProviderFromConfig(config)).toBeNull();
  });

  it("returns null when AI_PROVIDER is set but the matching API key is missing", () => {
    const config = loadConfig({ ...baseEnv, AI_PROVIDER: "anthropic" });
    expect(createProviderFromConfig(config)).toBeNull();
  });

  it("returns an AnthropicProvider when the provider and key are both configured", () => {
    const config = loadConfig({ ...baseEnv, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key-not-real" });
    expect(createProviderFromConfig(config)).toBeInstanceOf(AnthropicProvider);
  });

  it("returns an OpenAIProvider when configured for openai", () => {
    const config = loadConfig({ ...baseEnv, AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key-not-real" });
    expect(createProviderFromConfig(config)).toBeInstanceOf(OpenAIProvider);
  });

  it("returns a LocalOpenAICompatibleProvider when configured for a local endpoint", () => {
    const config = loadConfig({
      ...baseEnv,
      AI_PROVIDER: "local",
      LOCAL_AI_BASE_URL: "http://localhost:11434/v1",
    });
    expect(createProviderFromConfig(config)).toBeInstanceOf(LocalOpenAICompatibleProvider);
  });
});
