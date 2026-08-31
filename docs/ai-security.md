# AI Security

`packages/ai-engine` is the only place in this codebase that talks to an
LLM. This document covers its safety design; see
[architecture.md](architecture.md) for where it fits in the pipeline.

## Provider abstraction

`AIProvider` is a single-method interface (`complete()`) implemented by
`AnthropicProvider`, `OpenAIProvider` (using OpenAI's current Responses
API), and `LocalOpenAICompatibleProvider` (targeting the older Chat
Completions surface, since that's what local servers like Ollama/vLLM
actually implement). `createProviderFromConfig()` returns `null` — never a
fake or half-configured provider — when `AI_PROVIDER` is `"none"` or its
matching key/URL is missing. Every consumer of the AI engine must handle
`null` by falling back to deterministic-only analysis.

**No AI credentials are configured in this environment.** Everything
described below is real, tested code, but none of it has been exercised
against a live model — that's stated plainly here and in
`packages/ai-engine/README.md`.

## Prompt-injection defense (essential, per Section 14)

Repository content — source code, comments, README text, commit messages,
PR descriptions — is untrusted input that could contain text engineered to
redirect the model ("ignore previous instructions", "reveal your system
prompt", etc).

- **`wrapUntrustedContent()`** puts every piece of repository-derived
  content behind explicit `===BEGIN/END UNTRUSTED REPOSITORY CONTENT===`
  markers with an explicit warning that it is data, never an instruction,
  regardless of what it claims.
- **`buildSystemPreamble()`** keeps Sentinel's own task instructions
  clearly labeled and positioned as authoritative, ahead of anything
  wrapped as untrusted.
- **`detectPromptInjectionAttempt()`** is a secondary, audit-only
  heuristic scanner — a positive match is recorded in
  `injectionWarnings` and returned to the caller, but it **never blocks or
  alters the call**. The real defense is architectural: the model's output
  is only ever parsed and schema-validated (see below), never treated as
  an instruction or used to trigger a tool call directly.

## Never trust free-form output directly

`completeStructured()` never returns the model's raw text. Every call
site supplies a zod schema; the response is parsed as JSON and validated
against it. An invalid response (bad JSON, or valid JSON that fails schema
validation) triggers a corrective follow-up turn, up to a bounded number
of attempts; exhausting all attempts throws `AISchemaValidationError`
rather than returning unvalidated data to the caller.

## Secret redaction before every call

`redactSecretsInText()` pattern-matches and masks AWS keys, private-key
blocks, GitHub tokens, JWTs, and generic `key: "value"` secrets in every
untrusted content block **before** it's wrapped and sent — on top of, not
instead of, the dedicated secret-detection scanner never sending raw
secrets to the AI in the first place.

## Cost control

`estimateCostUsd()` uses a documented-approximate per-model pricing table
with a safe fallback for unrecognized models. `BudgetGuard` rejects a call
whose estimated cost would exceed the configured per-scan or monthly
budget **before** the call is made, not after — a rejected call never
reaches the provider.

## What's demonstrated end to end

`findingAnalysisSchema` + `buildFindingAnalysisPrompt()` wire all of the
above together for one concrete task: judging whether a deterministic
finding is a likely false positive given its surrounding code, with a
structured explanation and optional remediation suggestion. This is
tested against a fake provider double proving the retry-on-bad-JSON path,
retry-on-schema-mismatch path, markdown code-fence stripping, and
untrusted-content wrapping/redaction all work correctly — not tested
against a live model.
