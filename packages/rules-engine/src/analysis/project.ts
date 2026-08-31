import * as path from "node:path";
import { Project, type SourceFile } from "ts-morph";

const ANALYZABLE_EXTENSION = /\.(ts|tsx|js|jsx|mts|cts)$/;
const TEST_FILE = /\.(test|spec)\.[tj]sx?$/;

export interface LoadedProject {
  project: Project;
  rootDir: string;
  sourceFiles: SourceFile[];
}

function isAnalyzable(relativePath: string, includeTests: boolean): boolean {
  if (!ANALYZABLE_EXTENSION.test(relativePath)) return false;
  if (!includeTests && TEST_FILE.test(relativePath)) return false;
  if (relativePath.endsWith(".d.ts")) return false;
  return true;
}

/**
 * Loads a project from real files on disk for analysis. Mirrors
 * `buildCodeGraphFromDirectory` in `@sayan-sentinel/code-intelligence`
 * (same extension filter, same "skip unreadable files rather than fail the
 * whole scan" behavior) so the two layers walk the same file set. This
 * package does not reuse that function directly because the Rules Engine
 * needs the live `Project`/`SourceFile` handles for AST/type-checker work,
 * not the flattened graph `code-intelligence` produces for visualization.
 */
export function loadProjectFromDirectory(
  rootDir: string,
  filePaths: string[],
  options: { includeTests?: boolean } = {},
): LoadedProject {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const includeTests = options.includeTests ?? false;

  for (const relativePath of filePaths) {
    if (!isAnalyzable(relativePath, includeTests)) continue;
    try {
      project.addSourceFileAtPath(path.join(rootDir, relativePath));
    } catch {
      // Unreadable or unparseable file — skip it rather than fail the whole scan.
    }
  }

  return { project, rootDir, sourceFiles: project.getSourceFiles() };
}

/** Loads a project from in-memory sources — used by fixtures and unit tests. */
export function loadProjectFromSources(sources: Record<string, string>): LoadedProject {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  for (const [relativePath, content] of Object.entries(sources)) {
    project.createSourceFile(
      relativePath.startsWith("/") ? relativePath : `/${relativePath}`,
      content,
    );
  }
  return { project, rootDir: "/", sourceFiles: project.getSourceFiles() };
}

export function toRelativePath(sourceFile: SourceFile, rootDir: string): string {
  let p = sourceFile.getFilePath().replace(/\\/g, "/");
  const root = rootDir.replace(/\\/g, "/").replace(/\/$/, "");
  if (root && p.startsWith(root)) {
    p = p.slice(root.length);
  }
  return p.replace(/^\/+/, "");
}
