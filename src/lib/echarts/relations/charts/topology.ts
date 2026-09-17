import { type DataFrame, type Field, type PanelDataSummary } from '@grafana/data';
import { declaredEndpointKeys, endpointsOf, numericFields } from 'lib/echarts/relations/converters/contract';
import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';
import { resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';
import { isLegacyEdgesFrame, isLegacyNodesFrame } from 'lib/echarts/relations/converters/legacyToWide';
import { type RelationsTopology, type RelationsTopologyInput } from 'lib/echarts/relations/charts/types';

/** Read a legacy endpoint as a non-empty string. */
function endpointAt(field: Field | undefined, row: number): string | undefined {
  const value: unknown = field?.values[row];
  if (value == null || value === '') {
    return undefined;
  }
  return typeof value === 'string' ? value : String(value);
}

/** Return a case-insensitive field match. */
function fieldNamed(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((field) => field.name.toLowerCase() === name);
}

/** Read the endpoints and declared node count from either graph contract. */
function relationsTopologyInput(frames: DataFrame[]): RelationsTopologyInput | undefined {
  const legacyEdges = frames.find(isLegacyEdgesFrame);
  if (legacyEdges != null) {
    const sourceField = fieldNamed(legacyEdges, 'source');
    const targetField = fieldNamed(legacyEdges, 'target');
    const edges: RelationsTopologyInput['edges'] = [];
    for (let row = 0; row < legacyEdges.length; row++) {
      const source = endpointAt(sourceField, row);
      const target = endpointAt(targetField, row);
      if (source != null && target != null) {
        edges.push({ source, target });
      }
    }
    return { edges, nodeCount: frames.find(isLegacyNodesFrame)?.length };
  }

  const wide = resolveGraphWideRoles(frames);
  if (wide == null) {
    const nodesFrame = frames.find(isLegacyNodesFrame);
    return nodesFrame == null ? undefined : { edges: [], nodeCount: nodesFrame.length };
  }
  const edges = wide.edgesFrames.flatMap((frame) => {
    const declared = declaredEndpointKeys(frame);
    return numericFields(frame).flatMap((field) => {
      const endpoints = endpointsOf(field, declared);
      return endpoints == null ? [] : [endpoints];
    });
  });
  const nodeCount = wide.nodesFrames.reduce((count, frame) => count + numericFields(frame).length, 0);
  return { edges, ...(nodeCount > 0 ? { nodeCount } : {}) };
}

/** Count nodes and the links drawn by graph and Sankey presets. */
export function relationsMarkCounts(
  summary: PanelDataSummary
): { nodeCount: number; linkCount: number; sankeyLinkCount: number } | undefined {
  const input = relationsTopologyInput(summary.rawFrames ?? []);
  if (input == null) {
    return undefined;
  }
  const endpoints = new Set(input.edges.flatMap(({ source, target }) => [source, target]));
  const links = input.edges.map(({ source, target }, index) => ({
    id: `preset-edge-${index}`,
    source,
    target,
    value: null,
  }));
  return {
    nodeCount: Math.max(input.nodeCount ?? 0, endpoints.size),
    linkCount: links.length,
    sankeyLinkCount: toSankeyLinks(links).links.length,
  };
}

/** Measure the node count, cycle state, and longest path of a graph. */
export function relationsTopology(summary: PanelDataSummary): RelationsTopology | undefined {
  const input = relationsTopologyInput(summary.rawFrames ?? []);
  if (input == null) {
    return undefined;
  }

  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const { source, target } of input.edges) {
    adjacency.set(source, adjacency.get(source) ?? new Set());
    adjacency.set(target, adjacency.get(target) ?? new Set());
    indegree.set(source, indegree.get(source) ?? 0);
    indegree.set(target, indegree.get(target) ?? 0);
    const targets = adjacency.get(source)!;
    if (!targets.has(target)) {
      targets.add(target);
      indegree.set(target, indegree.get(target)! + 1);
    }
  }

  const queue: string[] = [];
  const levels = new Map<string, number>();
  for (const [node, count] of indegree) {
    if (count === 0) {
      queue.push(node);
      levels.set(node, 1);
    }
  }
  let visited = 0;
  let maxLevel = adjacency.size === 0 ? 0 : 1;
  for (let index = 0; index < queue.length; index++) {
    const source = queue[index];
    visited++;
    const nextLevel = (levels.get(source) ?? 1) + 1;
    for (const target of adjacency.get(source) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 1, nextLevel));
      maxLevel = Math.max(maxLevel, levels.get(target)!);
      const nextIndegree = indegree.get(target)! - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(target);
      }
    }
  }

  return {
    hasCycle: visited < adjacency.size,
    levels: maxLevel,
    nodeCount: Math.max(input.nodeCount ?? 0, adjacency.size),
  };
}
