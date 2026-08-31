export type NodeKind =
  | "file"
  | "function"
  | "class"
  | "method"
  | "route"
  | "external_module"
  | "env_var"
  | "external_endpoint"
  | "db_model"
  | "guard";

export interface CodeGraphNode {
  id: string;
  kind: NodeKind;
  /** Relative path (forward slashes) of the file this node belongs to, or was declared in. */
  filePath: string;
  name: string;
  lineStart: number;
  lineEnd: number;
  metadata?: Record<string, unknown>;
}

export type EdgeKind =
  | "IMPORTS"
  | "CALLS"
  | "EXPOSES_ROUTE"
  | "READS_FROM"
  | "WRITES_TO"
  | "AUTHENTICATES"
  | "AUTHORIZES"
  | "QUERIES"
  | "CALLS_EXTERNAL"
  | "DEPENDS_ON";

export interface CodeGraphEdge {
  id: string;
  kind: EdgeKind;
  fromNodeId: string;
  toNodeId: string;
  metadata?: Record<string, unknown>;
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

export class CodeGraphBuilderContext {
  private readonly nodeIds = new Set<string>();
  private readonly edgeIds = new Set<string>();
  public readonly nodes: CodeGraphNode[] = [];
  public readonly edges: CodeGraphEdge[] = [];

  addNode(node: CodeGraphNode): CodeGraphNode {
    if (this.nodeIds.has(node.id)) return node;
    this.nodeIds.add(node.id);
    this.nodes.push(node);
    return node;
  }

  hasNode(id: string): boolean {
    return this.nodeIds.has(id);
  }

  addEdge(edge: CodeGraphEdge): void {
    if (this.edgeIds.has(edge.id)) return;
    this.edgeIds.add(edge.id);
    this.edges.push(edge);
  }

  toGraph(): CodeGraph {
    return { nodes: this.nodes, edges: this.edges };
  }
}
