import { z } from "zod";

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v.toLowerCase() === "true"))
  .default(false);

/**
 * Mirrors .env.example. Every field that gates an optional feature
 * (AI, GitHub App, HexStrike) is optional here by design — the loader
 * derives feature-availability flags instead of failing validation, so
 * Sentinel can run with deterministic analysis only.
 */
export const envSchema = z.object({
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

  HEXSTRIKE_ENABLED: boolFromString,
  HEXSTRIKE_BASE_URL: z.string().optional(),
  HEXSTRIKE_API_KEY: z.string().optional(),

  LOCAL_LAB_MODE: boolFromString,
  DYNAMIC_VALIDATION_MAX_TIER: z.coerce.number().int().min(0).max(3).default(1),
  DYNAMIC_VALIDATION_MAX_RPS: z.coerce.number().positive().default(2),
  DYNAMIC_VALIDATION_MAX_REQUESTS: z.coerce.number().int().positive().default(50),
  DYNAMIC_VALIDATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  SEMGREP_BIN: z.string().default("semgrep"),
  GITLEAKS_BIN: z.string().default("gitleaks"),
  OSV_SCANNER_BIN: z.string().default("osv-scanner"),
});

export type Env = z.infer<typeof envSchema>;
