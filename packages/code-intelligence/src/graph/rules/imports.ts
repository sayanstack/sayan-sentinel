import type { SourceFile } from "ts-morph";
import { edgeId, nodeId, syntheticNodeId } from "../ids";
import type { CodeGraphBuilderContext } from "../types";

export function extractImports(
  ctx: CodeGraphBuilderContext,
  sourceFile: SourceFile,
  filePath: string,
  fileNodeId: string,
  normalizeFilePath: (absolutePath: string) => string,
): void {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue();

    if (specifier.startsWith(".")) {
      const resolved = importDecl.getModuleSpecifierSourceFile();
      if (resolved) {
        const targetPath = normalizeFilePath(resolved.getFilePath());
        const targetId = nodeId("file", targetPath, targetPath, 0);
        ctx.addEdge({
          id: edgeId("IMPORTS", fileNodeId, targetId),
          kind: "IMPORTS",
          fromNodeId: fileNodeId,
          toNodeId: targetId,
          metadata: { specifier },
        });
        continue;
      }
    }

    const targetId = syntheticNodeId("external_module", specifier);
    ctx.addNode({
      id: targetId,
      kind: "external_module",
      filePath: "",
      name: specifier,
      lineStart: 0,
      lineEnd: 0,
    });
    ctx.addEdge({
      id: edgeId("IMPORTS", fileNodeId, targetId),
      kind: "IMPORTS",
      fromNodeId: fileNodeId,
      toNodeId: targetId,
      metadata: { specifier },
    });
  }
}
