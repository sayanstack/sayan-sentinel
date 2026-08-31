interface SecretPattern {
  pattern: RegExp;
  label: string;
}

/**
 * Pattern-based secret detection for raw text before it's sent to an AI
 * provider (Sections 11/14: "Never send raw discovered secrets to an
 * LLM"). This is intentionally a lighter-weight pass than gitleaks — it
 * exists as a last line of defense on the AI-prompt path specifically, not
 * as a replacement for the dedicated secret-detection scanner.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  { pattern: /AKIA[0-9A-Z]{16}/g, label: "aws-access-key" },
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    label: "private-key-block",
  },
  { pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g, label: "github-token" },
  { pattern: /sk-[A-Za-z0-9]{20,}/g, label: "generic-sk-prefixed-secret" },
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: "jwt" },
  {
    // \b around the keyword so "token" doesn't spuriously match inside an
    // already-handled identifier like "github_token" (both are \w chars,
    // so no boundary exists between them — this pattern correctly skips it).
    pattern: /\b(?<keyName>api[_-]?key|secret|password|token)\b\s*[:=]\s*["'](?<value>[^"'\s]{8,})["']/gi,
    label: "generic-key-value-secret",
  },
];

export interface RedactSecretsResult {
  redacted: string;
  foundLabels: string[];
}

export function redactSecretsInText(text: string): RedactSecretsResult {
  let redacted = text;
  const foundLabels = new Set<string>();

  for (const { pattern, label } of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (...args) => {
      foundLabels.add(label);
      const maybeGroups = args[args.length - 1];
      if (label === "generic-key-value-secret" && maybeGroups && typeof maybeGroups === "object") {
        const groups = maybeGroups as { keyName?: string };
        return `${groups.keyName ?? "secret"}="[redacted]"`;
      }
      return "[redacted-secret]";
    });
  }

  return { redacted, foundLabels: [...foundLabels] };
}
