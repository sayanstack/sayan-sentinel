import { describe, expect, it } from "vitest";
import { ConfigValidationError, loadConfig } from "./load.js";

const baseEnv = {
  DATABASE_URL: "postgresql://sentinel:sentinel@localhost:5432/sentinel",
  REDIS_URL: "redis://localhost:6379",
};

describe("loadConfig", () => {
  it("loads with only the required vars set and disables optional features", () => {
    const config = loadConfig(baseEnv);
    expect(config.env.NODE_ENV).toBe("development");
    expect(config.features.aiEnabled).toBe(false);
    expect(config.features.githubAppEnabled).toBe(false);
    expect(config.features.hexstrikeEnabled).toBe(false);
  });

  it("throws ConfigValidationError when a required var is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigValidationError);
  });

  it("enables AI only when the provider AND its matching key are both present", () => {
    const withProviderOnly = loadConfig({ ...baseEnv, AI_PROVIDER: "anthropic" });
    expect(withProviderOnly.features.aiEnabled).toBe(false);

    const withBoth = loadConfig({
      ...baseEnv,
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key-not-real",
    });
    expect(withBoth.features.aiEnabled).toBe(true);
  });

  it("enables the GitHub App only when id, private key path, and webhook secret are all present", () => {
    const partial = loadConfig({ ...baseEnv, GITHUB_APP_ID: "123" });
    expect(partial.features.githubAppEnabled).toBe(false);

    const complete = loadConfig({
      ...baseEnv,
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY_PATH: "./secrets/key.pem",
      GITHUB_WEBHOOK_SECRET: "test-secret-not-real",
    });
    expect(complete.features.githubAppEnabled).toBe(true);
  });

  it("enables HexStrike only when explicitly enabled AND a base URL is set", () => {
    const flagOnly = loadConfig({ ...baseEnv, HEXSTRIKE_ENABLED: "true" });
    expect(flagOnly.features.hexstrikeEnabled).toBe(false);

    const complete = loadConfig({
      ...baseEnv,
      HEXSTRIKE_ENABLED: "true",
      HEXSTRIKE_BASE_URL: "http://localhost:8888",
    });
    expect(complete.features.hexstrikeEnabled).toBe(true);
  });

  it("defaults LOCAL_LAB_MODE to false when unset", () => {
    const config = loadConfig(baseEnv);
    expect(config.env.LOCAL_LAB_MODE).toBe(false);
  });
});
