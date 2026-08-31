import { createTaintSinkRule } from "../generic-taint-rule";

/**
 * Flags untrusted input reaching a raw/unparameterized query API
 * (`prisma.$queryRawUnsafe`, `prisma.$executeRawUnsafe`, a bare
 * `connection.query(...)`/`knex.raw(...)`) without a neutralizing
 * transform. Ordinary parameterized ORM calls (`prisma.user.findUnique`,
 * `knex("users").where(...)`) are not matched at all — they never appear in
 * the raw-query sink catalog, so normal ORM usage is never flagged.
 */
export const injSqlInjection = createTaintSinkRule({
  id: "SENTINEL-INJ-001",
  title: "SQL / Raw Query Injection",
  description:
    "Untrusted input reaches a raw or unparameterized database query API without a neutralizing transform, " +
    "allowing an attacker to alter the query's structure.",
  category: "injection",
  severity: "critical",
  cwe: "CWE-89",
  owasp: ["A03:2021 – Injection"],
  remediation:
    "Use parameterized queries (Prisma's tagged-template `$queryRaw`, a query builder's bound parameters, or an ORM " +
    "method) instead of building SQL from untrusted input. If a raw/unsafe API is unavoidable, validate the input " +
    "against a strict allowlist before it reaches the query.",
  sinkCategory: "raw_query",
  findingTitle: "Potential SQL/Raw Query Injection",
  buildReason: (flow, leaf) =>
    `Detected: untrusted input from ${leaf.binding.origin.source.description} reaches ${flow.sink.api}(...) with no ` +
    `neutralizing transform observed. Observed: the query is constructed from this value rather than a parameterized form.`,
});
