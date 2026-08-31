import type { Project, SourceFile } from "ts-morph";
import { extractRouteHandlers, type RouteHandler } from "../analysis/routes";
import { toRelativePath } from "../analysis/project";
import type { SentinelConfig } from "./config";

export class RuleContext {
  readonly routes: RouteHandler[];

  constructor(
    readonly project: Project,
    readonly rootDir: string,
    readonly sourceFiles: SourceFile[],
    readonly config: SentinelConfig,
  ) {
    this.routes = sourceFiles.flatMap((sf) =>
      extractRouteHandlers(sf, toRelativePath(sf, rootDir)),
    );
  }

  relativePath(sourceFile: SourceFile): string {
    return toRelativePath(sourceFile, this.rootDir);
  }
}
