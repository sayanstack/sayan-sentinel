import type { Severity } from "@sayan-sentinel/shared";
import type { SupportedFramework } from "./types";

export interface SentinelRuleOverride {
  enabled?: boolean;
  severity?: Severity;
}

export interface SentinelConfig {
  rules?: Record<string, SentinelRuleOverride>;
  analysis?: {
    frameworks?: SupportedFramework[];
    exclude?: string[];
  };
}

export const DEFAULT_CONFIG: SentinelConfig = {
  rules: {},
  analysis: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.test.ts", "**/*.spec.ts"],
  },
};

/**
 * Identity helper for `sentinel.config.ts` authors — `defineSentinelConfig({...})`
 * gets full type-checking on the config shape with zero runtime behavior.
 */
export function defineSentinelConfig(config: SentinelConfig): SentinelConfig {
  return config;
}

export function isRuleEnabled(config: SentinelConfig, ruleId: string): boolean {
  return config.rules?.[ruleId]?.enabled !== false;
}

export function severityOverride(config: SentinelConfig, ruleId: string): Severity | undefined {
  return config.rules?.[ruleId]?.severity;
}
