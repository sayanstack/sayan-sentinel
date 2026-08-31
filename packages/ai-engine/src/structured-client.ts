import type { z } from "zod";
import { AISchemaValidationError } from "./errors";
import { detectPromptInjectionAttempt } from "./prompt/injection-detector";
import { buildSystemPreamble, wrapUntrustedContent } from "./prompt/prompt-sections";
import type { AIMessage, AIProvider, AIUsage } from "./provider";
import { redactSecretsInText } from "./redact-secrets-in-text";

export interface UntrustedContentBlock {
  label: string;
  content: string;
}

export interface StructuredCompletionOptions<T> {
  provider: AIProvider;
  model: string;
  /** Sentinel's own task instructions — trusted, never derived from repository content. */
  applicationInstructions: string;
  /** Repository-derived content — always wrapped and redacted before inclusion. */
  untrustedContent?: UntrustedContentBlock[];
  userPrompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  maxAttempts?: number;
  timeoutMs?: number;
}

export interface StructuredCompletionResult<T> {
  data: T;
  usage: AIUsage;
  attempts: number;
  /** Non-empty if any untrusted content block matched a known injection pattern — for audit, not enforcement. */
  injectionWarnings: string[];
  /** Non-empty if any untrusted content block contained a pattern-matched secret that was redacted before sending. */
  redactedSecretLabels: string[];
}

const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MAX_ATTEMPTS = 3;

function extractJsonCandidate(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(extractJsonCandidate(text)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Runs a schema-validated AI completion. Every piece of `untrustedContent`
 * is redacted for pattern-matched secrets, scanned for injection phrasing
 * (recorded, not acted on), and wrapped in explicit untrusted-content
 * markers before being sent (Section 14). The model's raw text output is
 * NEVER returned to the caller — only the result of parsing it as JSON and
 * validating it against `schema` is. A response that fails to parse or
 * validate triggers a corrective follow-up turn (up to `maxAttempts`
 * total); if it still doesn't validate, this throws
 * `AISchemaValidationError` rather than returning unvalidated data.
 */
export async function completeStructured<T>(
  options: StructuredCompletionOptions<T>,
): Promise<StructuredCompletionResult<T>> {
  const injectionWarnings: string[] = [];
  const redactedSecretLabels = new Set<string>();

  const untrustedBlocks = (options.untrustedContent ?? []).map(({ label, content }) => {
    const scan = detectPromptInjectionAttempt(content);
    if (scan.suspicious) {
      injectionWarnings.push(`${label}: ${scan.matchedLabels.join(", ")}`);
    }
    const { redacted, foundLabels } = redactSecretsInText(content);
    foundLabels.forEach((l) => redactedSecretLabels.add(l));
    return wrapUntrustedContent(label, redacted);
  });

  const system = buildSystemPreamble(options.applicationInstructions);
  const messages: AIMessage[] = [
    { role: "user", content: [...untrustedBlocks, options.userPrompt].join("\n\n") },
  ];

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let usage: AIUsage = { inputTokens: 0, outputTokens: 0 };
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await options.provider.complete(
      {
        model: options.model,
        system,
        messages,
        maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      },
      { timeoutMs: options.timeoutMs },
    );
    usage = {
      inputTokens: usage.inputTokens + response.usage.inputTokens,
      outputTokens: usage.outputTokens + response.usage.outputTokens,
    };

    const parsed = tryParseJson(response.text);
    if (!parsed.ok) {
      lastError = parsed.error;
      messages.push({ role: "assistant", content: response.text });
      messages.push({
        role: "user",
        content:
          "Your last response was not valid JSON. Respond again with ONLY valid JSON, no prose before or after it.",
      });
      continue;
    }

    const validated = options.schema.safeParse(parsed.value);
    if (validated.success) {
      return {
        data: validated.data,
        usage,
        attempts: attempt,
        injectionWarnings,
        redactedSecretLabels: [...redactedSecretLabels],
      };
    }

    lastError = validated.error;
    messages.push({ role: "assistant", content: response.text });
    messages.push({
      role: "user",
      content: `Your last response did not match the required JSON schema:\n${validated.error.message}\nRespond again with ONLY corrected JSON.`,
    });
  }

  throw new AISchemaValidationError(
    `AI response did not satisfy the required schema after ${maxAttempts} attempt(s)`,
    lastError,
    maxAttempts,
  );
}
