import * as path from "node:path";
import { Project } from "ts-morph";
import { nodeId } from "./ids";
import { extractDbQueries } from "./rules/db-queries";
import { extractDeclarations } from "./rules/declarations";
import { extractEnvUsage } from "./rules/env-usage";
import { extractExternalCalls } from "./rules/external-calls";
import { extractGuards } from "./rules/guards";
import { extractImports } from "./rules/imports";
import { extractRoutes } from "./rules/routes";
import { CodeGraphBuilderContext, type CodeGraph } from "./types";

const ANALYZABLE_EXTENSION = /\.(ts|tsx|js|jsx|mts|cts)$/;

function normalizePath(absoluteOrVirtualPath: string, rootDir?: string): string {
  let p = absoluteOrVirtualPath.replace(/\\/g, "/");
  if (rootDir) {
    const root = rootDir.replace(/\\/g, "/").replace(/\/$/, "");
    if (p.startsWith(root)) {
      p = p.slice(root.length);
    }
  }
  return p.replace(/^\/+/, "");
}

function buildFromProject(project: Project, rootDir?: string): CodeGraph {
  const ctx = new CodeGraphBuilderContext();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = normalizePath(sourceFile.getFilePath(), rootDir);

    const fileNode = ctx.addNode({
      id: nodeId("file", filePath, filePath, 0),
      kind: "file",
      filePath,
      name: filePath,
      lineStart: 0,
      lineEnd: sourceFile.getEndLineNumber(),
    });

    extractImports(ctx, sourceFile, filePath, fileNode.id, (p) => normalizePath(p, rootDir));
    extractDeclarations(ctx, sourceFile, filePath);
    extractRoutes(ctx, sourceFile, filePath);
    extractEnvUsage(ctx, sourceFile, filePath);
    extractExternalCalls(ctx, sourceFile, filePath);
    extractDbQueries(ctx, sourceFile, filePath);
    extractGuards(ctx, sourceFile, filePath);
  }

  return ctx.toGraph();
}

/**
 * Builds a code graph directly from in-memory source text — used by tests
 * and anywhere a graph is needed without touching the filesystem.
 */
export function buildCodeGraphFromSources(sources: Record<string, string>): CodeGraph {
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  for (const [relativePath, content] of Object.entries(sources)) {
    project.createSourceFile(
      relativePath.startsWith("/") ? relativePath : `/${relativePath}`,
      content,
    );
  }
  return buildFromProject(project);
}

export interface BuildCodeGraphFromDirectoryOptions {
  rootDir: string;
  /** Relative paths, typically the output of `walkRepositoryFiles`. */
  filePaths: string[];
}

/**
 * Builds a code graph from real files on disk — the ingestion pipeline
 * passes the already-filtered file list from `walkRepositoryFiles` here
 * rather than letting ts-morph glob the directory itself, so exclusion/size
 * limits stay enforced in exactly one place.
 */
export function buildCodeGraphFromDirectory(
  options: BuildCodeGraphFromDirectoryOptions,
): CodeGraph {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  for (const relativePath of options.filePaths) {
    if (!ANALYZABLE_EXTENSION.test(relativePath)) continue;
    try {
      project.addSourceFileAtPath(path.join(options.rootDir, relativePath));
    } catch {
      // Unreadable or unparseable file — skip it rather than fail the whole scan.
    }
  }

  return buildFromProject(project, options.rootDir);
}
