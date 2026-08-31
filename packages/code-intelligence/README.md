# @sayan-sentinel/code-intelligence

AST-based code graph builder (TypeScript compiler API via `ts-morph`), plus the repository ingestion pipeline that feeds it.

**Status:** ingestion and TS/JS graph extraction implemented. See [../../docs/implementation-plan.md](../../docs/implementation-plan.md) for full detail and what's still missing.

## Ingestion (`src/ingestion/`)

Repository content is treated as untrusted input throughout:

- `git-ingestor.ts` — clones exactly one commit via a blobless partial clone,
  fetching the SHA directly with a shallow-branch fallback. Runs `git` via
  `execFile` (argument arrays, never a shell) with a per-command timeout.
  Never executes anything from the repository itself.
- `path-safety.ts` — path-traversal protection.
- `file-walker.ts` — symlink protection, vendor/generated dir exclusion,
  per-file and aggregate size limits, binary exclusion by content sniff.

## Code graph (`src/graph/`)

`buildCodeGraphFromDirectory({ rootDir, filePaths })` (real files) and
`buildCodeGraphFromSources({ path: content })` (in-memory, used by tests)
both produce a `{ nodes, edges }` graph. Implemented detection rules:
imports, functions/classes/methods, Express + NestJS routes, `process.env`
reads, outbound HTTP calls (`fetch`/`axios`/`http(s)`/`got`), Prisma-style
queries, and NestJS `@UseGuards`.

Not yet implemented: middleware chains, non-Prisma data access, non-
Express/Nest frameworks, cross-function `CALLS` edges, and non-TS/JS
languages — see Section 8 of the product spec for the intended extension
surface.

## Testing

```bash
pnpm --filter @sayan-sentinel/code-intelligence test
```

The ingestion tests spin up a real local git repository (no network) to
verify commit-exact checkout, the SHA-fetch fallback path, that repository
content is never executed, and that credentials embedded in a clone URL
never leak into an error message — including from git's own stderr.
