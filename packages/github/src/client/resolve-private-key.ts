import * as crypto from "node:crypto";
import * as fs from "node:fs";

export interface PrivateKeySource {
  /** The PEM content itself, inline — takes priority over `path` when both are set. */
  inline?: string;
  /** A file path to read the PEM from, for anyone who mounts a real `.pem` file instead. */
  path?: string;
}

/**
 * Resolves a GitHub App private key from either an inline env var or a
 * file path — kept out of `GitHubAppClient` itself so that class only
 * ever deals in key material, never in "where did this come from."
 *
 * A pasted inline key picks up damage in a few well-known ways, all
 * fixed here rather than left to surface as an opaque `DataError:
 * Invalid keyData` from deep inside the JWT-signing library — confirmed
 * against a real deployment (Railway) that hit exactly that error on an
 * otherwise-correct, freshly-downloaded key file:
 *  - collapsed onto one line with literal `\n` escape sequences instead
 *    of real newlines (common for hosts whose variable editor is a
 *    single-line input, or copy/paste through certain terminals);
 *  - `\r\n` line endings instead of `\n` (pasting from a Windows text
 *    editor);
 *  - a leading/trailing wrapping quote character (pasting a value that
 *    was itself copied out of a JSON blob or another env-var UI);
 *  - stray leading/trailing whitespace or blank lines from the copy.
 */
export function resolvePrivateKey(source: PrivateKeySource): string | null {
  if (source.inline) {
    const unwrapped = source.inline.trim().replace(/^['"]|['"]$/g, "");
    const normalized = unwrapped.replace(/\r\n/g, "\n").trim();
    return normalized.includes("\n") ? normalized : normalized.replace(/\\n/g, "\n");
  }
  if (source.path) {
    try {
      return fs.readFileSync(source.path, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

export interface PrivateKeyDiagnostics {
  valid: boolean;
  detail: string;
  /** Safe to log: no key material, just shape — length, line count, and whether the PEM markers are present. */
  shape: string;
}

/**
 * Validates a resolved key with the same `crypto` module Node's own TLS/JWT
 * machinery uses, so a malformed key is caught — with an actionable,
 * key-shape summary that never includes the key material itself — at
 * `GitHubAppClient` construction time (once, at process startup) instead of
 * surfacing as an opaque `DataError: Invalid keyData` the first time a
 * webhook happens to need a JWT signed.
 */
export function validatePrivateKey(key: string): PrivateKeyDiagnostics {
  const lines = key.split("\n");
  const shape = `length=${key.length} lines=${lines.length} startsWithBegin=${key.startsWith("-----BEGIN")} endsWithEnd=${key.trimEnd().endsWith("-----")} firstLine="${lines[0]}" lastLine="${lines[lines.length - 1]}"`;

  try {
    crypto.createPrivateKey(key);
    return { valid: true, detail: "OK", shape };
  } catch (error) {
    return {
      valid: false,
      detail: error instanceof Error ? error.message : String(error),
      shape,
    };
  }
}
