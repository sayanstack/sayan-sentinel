# @sayan-sentinel/policy-engine

Per-repository policy definitions and evaluation.

**Status:** implemented. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md).

`evaluatePolicy(rules, { findings, changeSensitivity })` evaluates a
discriminated `PolicyRule` union against one scan/PR's findings.
`DEFAULT_POLICY_RULES` implements Section 28's five example policies: fail
on critical, fail on confirmed high, block new secrets, block critical
dependency vulnerabilities, require review for auth changes.

## Testing

```bash
pnpm --filter @sayan-sentinel/policy-engine test
```
