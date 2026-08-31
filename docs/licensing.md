# Third-Party Tool Licensing

Sentinel is [MIT-licensed](../LICENSE). This document tracks the license
of every external security tool it shells out to, since those tools are
invoked as separate subprocesses (never linked into or vendored inside
Sentinel's own codebase), which is what keeps their licenses from
affecting Sentinel's own.

| Tool                                                 | License                               | How it's invoked                                                                          |
| ---------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Semgrep](https://github.com/semgrep/semgrep)        | LGPL 2.1 (CLI, as of recent releases) | Subprocess (`execFile`), JSON output parsed. Never imported as a library, never vendored. |
| [Gitleaks](https://github.com/gitleaks/gitleaks)     | MIT                                   | Subprocess, JSON report file parsed.                                                      |
| [OSV-Scanner](https://github.com/google/osv-scanner) | Apache-2.0                            | Subprocess, JSON output parsed.                                                           |
| [HexStrike AI](https://github.com/)                  | See its own repository                | Accessed over HTTP as a separate server process — never linked or vendored.               |

## Why subprocess invocation matters here

Each of these tools is installed and run as an independent executable;
Sentinel's adapters (`packages/security-engine`,
`packages/hexstrike-adapter`) only parse their output. This is the same
boundary Docker-based CI systems use, and it means:

- Sentinel's own MIT license is unaffected by any of the above — none of
  their source is copied into or statically linked with this codebase.
  This is also why every adapter reports the tool as `unavailable` rather
  than bundling/vendoring it when it isn't installed.
- Users are responsible for accepting each tool's own license when they
  install it, exactly as they would installing it standalone.

## npm dependencies

Standard npm dependency licenses apply per-package (`@nestjs/*`, Prisma,
`@octokit/*`, the Anthropic/OpenAI SDKs, etc.) — all are permissively
licensed (MIT/Apache-2.0) as is typical for the Node ecosystem; no
GPL-family npm dependency is used. Run `pnpm licenses list` if you need a
full generated report before a compliance review.
