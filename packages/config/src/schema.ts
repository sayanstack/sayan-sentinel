import { z } from "zod";

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
  .default(false);

/**
 * Mirrors .env.example. Every field that gates an optional feature
 * (AI, GitHub App, dynamic validation) is optional here by design — the loader
 * derives feature-availability flags instead of failing validation, so
 * Sentinel can run with deterministic analysis only.
 */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  SESSION_SECRET: z.string().min(1).optional(),
  COOKIE_DOMAIN: z.string().default("localhost"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_BUCKET: z.string().default("sentinel-artifacts"),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: boolFromString,

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  AI_PROVIDER: z.enum(["none", "anthropic", "openai", "local"]).default("none"),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOCAL_AI_BASE_URL: z.string().optional(),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(0),
  AI_PER_SCAN_BUDGET_USD: z.coerce.number().nonnegative().default(0),

  DYNAMIC_VALIDATION_ENABLED: boolFromString,
  DYNAMIC_VALIDATION_BASE_URL: z.string().optional(),
  DYNAMIC_VALIDATION_API_KEY: z.string().optional(),

  LOCAL_LAB_MODE: boolFromString,
  /**
   * Marks this deployment as the public, multi-tenant hosted product
   * (`sentinel.sayanstack.com`), not a self-hosted/local instance —
   * tightens what an operator is even *allowed* to configure, on top of
   * (never instead of) Scope Guard's own always-on protections. See the
   * cross-field checks below and docs/hosted-security-model.md.
   */
  SENTINEL_HOSTED_MODE: boolFromString,
  DYNAMIC_VALIDATION_MAX_TIER: z.coerce.number().int().min(0).max(3).default(1),
  DYNAMIC_VALIDATION_MAX_RPS: z.coerce.number().positive().default(2),
  DYNAMIC_VALIDATION_MAX_REQUESTS: z.coerce.number().int().positive().default(50),
  DYNAMIC_VALIDATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  SEMGREP_BIN: z.string().default("semgrep"),
  GITLEAKS_BIN: z.string().default("gitleaks"),
  OSV_SCANNER_BIN: z.string().default("osv-scanner"),
});

/**
 * Cross-field checks that only make sense once every individual field has
 * already parsed — Zod's per-field validators run first, then this runs
 * against the fully-typed result. Both checks exist because the
 * individual fields are each independently valid (a boolean, a number in
 * [0,3]) but the *combination* is a real safety hole: `LOCAL_LAB_MODE`
 * exists specifically to let a private/loopback target through Scope
 * Guard for local demo purposes, and a validation tier above 1 exists
 * specifically to allow state-changing/destructive dynamic validation —
 * neither is acceptable on a deployment serving untrusted, multi-tenant
 * traffic. Failing config load (not just documenting the rule) is what
 * makes this a real interlock rather than an operator convention that
 * can be forgotten.
 */
export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (env.SENTINEL_HOSTED_MODE && env.LOCAL_LAB_MODE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LOCAL_LAB_MODE"],
      message:
        "LOCAL_LAB_MODE cannot be enabled together with SENTINEL_HOSTED_MODE — it would let a hosted, " +
        "multi-tenant deployment scan private/loopback addresses.",
    });
  }
  if (env.SENTINEL_HOSTED_MODE && env.DYNAMIC_VALIDATION_MAX_TIER > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DYNAMIC_VALIDATION_MAX_TIER"],
      message:
        "DYNAMIC_VALIDATION_MAX_TIER cannot exceed 1 under SENTINEL_HOSTED_MODE — Tier 2 (state-changing) " +
        "and Tier 3 (destructive) dynamic validation are never available to a hosted deployment.",
    });
  }
});

export type Env = z.infer<typeof baseEnvSchema>;
