export interface RelationsTopology {
  hasCycle: boolean;
  levels: number;
  nodeCount: number;
}

export interface RelationsTopologyInput {
  edges: Array<{ source: string; target: string }>;
  nodeCount?: number;
}
