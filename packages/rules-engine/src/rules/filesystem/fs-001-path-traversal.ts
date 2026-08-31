import { createTaintSinkRule } from "../generic-taint-rule";

/**
 * Flags untrusted input reaching a filesystem API (`fs.readFile`,
 * `fs.writeFile`, `fs.unlink`, ...) without a neutralizing transform.
 * `path.normalize`/`path.basename` are tracked as transforms but
 * deliberately never neutralize this rule (see `transforms.ts`) — collapsing
 * `../` sequences or stripping directory components does not, by itself,
 * prove the resulting path stays within an intended root; that requires an
 * explicit containment check Sentinel does not infer from `normalize()` alone.
 */
export const fsPathTraversal = createTaintSinkRule({
  id: "SENTINEL-FS-001",
  title: "Path Traversal",
  description:
    "Untrusted input reaches a filesystem API without a sufficiently strong restriction, allowing an attacker to " +
    "read, write, or delete files outside the intended directory via `../` sequences or an absolute path.",
  category: "filesystem",
  severity: "high",
  cwe: "CWE-22",
  owasp: ["A01:2021 – Broken Access Control"],
  remediation:
    "Resolve the final path with `path.resolve()` and verify it is still contained within the intended root directory " +
    "(e.g. `resolved.startsWith(rootDir + path.sep)`) before use — `path.normalize()`/`path.basename()` alone do not " +
    "guarantee containment.",
  sinkCategory: "filesystem",
  findingTitle: "Potential Path Traversal",
  buildReason: (flow, leaf) =>
    `Detected: untrusted input from ${leaf.binding.origin.source.description} reaches ${flow.sink.api}(...) with no ` +
    `observable root-containment check.`,
});
