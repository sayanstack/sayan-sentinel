import type { SentinelRule } from "./types";

/**
 * The single source of truth for which rules exist. The Rule Explorer UI
 * and the CLI's `--rule` filter both read from this registry rather than a
 * separately maintained catalog — a rule that isn't registered here doesn't
 * exist as far as any consumer is concerned, which is what keeps
 * documentation and behavior from drifting apart.
 */
export class RuleRegistry {
  private readonly rules = new Map<string, SentinelRule>();

  register(rule: SentinelRule): this {
    if (this.rules.has(rule.id)) {
      throw new Error(
        `Rule ID "${rule.id}" is already registered — rule IDs must be unique and stable.`,
      );
    }
    this.rules.set(rule.id, rule);
    return this;
  }

  registerAll(rules: SentinelRule[]): this {
    for (const rule of rules) this.register(rule);
    return this;
  }

  get(ruleId: string): SentinelRule | undefined {
    return this.rules.get(ruleId);
  }

  all(): SentinelRule[] {
    return [...this.rules.values()];
  }
}
