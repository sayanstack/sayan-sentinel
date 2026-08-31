import { createTaintSinkRule } from "../generic-taint-rule";

/**
 * Flags untrusted input reaching `child_process.exec`/`execSync` (or a bare
 * `eval`). `numeric_coercion` neutralizes this — a number cannot carry shell
 * metacharacters — but `format_validation` (e.g. a UUID check) does not,
 * since a UUID-shaped string can still contain shell metacharacters if the
 * validator's regex is loose or bypassed upstream.
 */
export const injCommandInjection = createTaintSinkRule({
  id: "SENTINEL-INJ-002",
  title: "OS Command Injection",
  description:
    "Untrusted input reaches a shell-executing API (`child_process.exec`/`execSync`, `eval`) without a neutralizing " +
    "transform, allowing an attacker to inject arbitrary shell commands.",
  category: "injection",
  severity: "critical",
  cwe: "CWE-78",
  owasp: ["A03:2021 – Injection"],
  remediation:
    "Avoid shell-interpreting APIs for untrusted input. Use `execFile`/`spawn` with an argument array (not a shell " +
    "string) so the input is never parsed by a shell, and validate the input against a strict allowlist regardless.",
  sinkCategory: "command_execution",
  findingTitle: "Potential OS Command Injection",
  buildReason: (flow, leaf) =>
    `Detected: untrusted input from ${leaf.binding.origin.source.description} reaches ${flow.sink.api}(...) with no ` +
    `neutralizing transform observed. Observed: the command string is constructed from this value.`,
});
