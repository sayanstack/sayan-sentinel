/**
 * Strips embedded credentials from a URL (e.g. an authenticated GitHub
 * clone URL like `https://x-access-token:ghs_xxx@github.com/...`) before
 * the URL is ever logged, included in an error message, or sent to an AI
 * provider. Malformed input is treated conservatively: if it can't be
 * parsed as a URL, any `user:pass@` looking prefix is stripped textually
 * rather than the whole string being returned unredacted.
 */
export function redactCredentialsFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return url.replace(/\/\/[^/@\s]+@/, "//[redacted]@");
  }
}

/**
 * Masks a discovered secret value so it can be referenced (e.g. in a UI or
 * evidence record) without ever displaying it in full. Short values are
 * fully redacted rather than partially shown, since a short secret has
 * little to lose by full redaction and much to lose from a partial hint.
 */
export function maskSecretValue(secret: string): string {
  const visibleChars = 3;
  if (secret.length <= visibleChars * 3) {
    return "[redacted]";
  }
  const maskedLength = Math.min(8, secret.length - visibleChars * 2);
  return `${secret.slice(0, visibleChars)}${"*".repeat(maskedLength)}${secret.slice(-visibleChars)}`;
}

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|apikey|api_key|privatekey|private_key|authorization)/i;

/**
 * Recursively redacts values on keys that look secret-shaped. Used as a
 * last line of defense before logging or sending arbitrary objects
 * (scanner output, request metadata) to an AI provider or telemetry sink —
 * on top of, not instead of, not collecting the value in the first place.
 */
export function redactSensitiveKeys<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveKeys(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
    } else {
      result[key] = redactSensitiveKeys(val, seen);
    }
  }
  return result as T;
}
