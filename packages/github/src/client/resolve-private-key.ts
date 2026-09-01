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
 * A pasted inline key commonly loses its real newlines (many hosts'
 * variable editors, and copy/paste in general, collapse a multi-line PEM
 * onto one line with literal `\n` escape sequences) — this un-escapes
 * that case, but leaves an already-multi-line value untouched.
 */
export function resolvePrivateKey(source: PrivateKeySource): string | null {
  if (source.inline) {
    return source.inline.includes("\n") ? source.inline : source.inline.replace(/\\n/g, "\n");
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
