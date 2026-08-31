import type { EdgeKind, NodeKind } from "./types";

export function nodeId(kind: NodeKind, filePath: string, name: string, lineStart: number): string {
  return `${kind}:${filePath}:${name}:${lineStart}`;
}

export function syntheticNodeId(kind: NodeKind, key: string): string {
  return `${kind}:~:${key}`;
}

export function edgeId(kind: EdgeKind, fromNodeId: string, toNodeId: string): string {
  return `${kind}:${fromNodeId}=>${toNodeId}`;
}
