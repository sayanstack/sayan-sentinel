import { envSchema, type Env } from "./schema";

export interface FeatureFlags {
  aiEnabled: boolean;
  githubAppEnabled: boolean;
  hexstrikeEnabled: boolean;
  hostedMode: boolean;
}

export interface SentinelConfig {
  env: Env;
  features: FeatureFlags;
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

function deriveFeatureFlags(env: Env): FeatureFlags {
  const aiEnabled =
    env.AI_PROVIDER !== "none" &&
    ((env.AI_PROVIDER === "anthropic" && !!env.ANTHROPIC_API_KEY) ||
      (env.AI_PROVIDER === "openai" && !!env.OPENAI_API_KEY) ||
      (env.AI_PROVIDER === "local" && !!env.LOCAL_AI_BASE_URL));

  const githubAppEnabled = !!(
    env.GITHUB_APP_ID &&
    env.GITHUB_APP_PRIVATE_KEY_PATH &&
    env.GITHUB_WEBHOOK_SECRET
  );

  const hexstrikeEnabled = env.HEXSTRIKE_ENABLED && !!env.HEXSTRIKE_BASE_URL;

  return { aiEnabled, githubAppEnabled, hexstrikeEnabled, hostedMode: env.SENTINEL_HOSTED_MODE };
}

/**
 * Parses and validates process.env (or a supplied source) into a typed
 * config plus derived feature-availability flags. Never throws for a
 * missing *optional* integration — those simply resolve to
 * features.<name>Enabled === false so callers can render a clean
 * "not configured" state instead of a crash or a fake success.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): SentinelConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new ConfigValidationError(issues);
  }
  return { env: parsed.data, features: deriveFeatureFlags(parsed.data) };
}
