import * as path from "node:path";

export class PathTraversalError extends Error {
  constructor(
    public readonly candidate: string,
    public readonly root: string,
  ) {
    super(`Path "${candidate}" escapes ingestion root "${root}"`);
    this.name = "PathTraversalError";
  }
}

/**
 * Resolves `candidate` (relative or absolute) against `root` and verifies
 * the result stays inside `root`. Repository file paths and symlink
 * targets are untrusted input — a crafted `../../../etc/passwd` or an
 * absolute path must never be allowed to resolve outside the ingestion
 * workspace.
 */
export function resolveWithinRoot(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (relative === "") {
    return resolvedCandidate;
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathTraversalError(candidate, resolvedRoot);
  }
  return resolvedCandidate;
}

export function isWithinRoot(root: string, candidate: string): boolean {
  try {
    resolveWithinRoot(root, candidate);
    return true;
  } catch {
    return false;
  }
}
