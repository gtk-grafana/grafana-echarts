import { type DataFrame, type GrafanaTheme2, type ReduceDataOptions } from '@grafana/data';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { isLegacyGraphFrames } from 'lib/echarts/relations/converters/legacyToWide';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';

import { GRAPH_NODES_WIDE } from 'lib/echarts/relations/converters/contract';
import { resolveGraphWideRoles } from 'lib/echarts/relations/converters/frameRoles';

export type RelationsReadIssueReason =
  'unsupported-frame-shape' | 'nodes-without-edges' | 'edges-without-endpoints' | 'legacy-row-data';

export type RelationsGraphReadResult =
  { kind: 'data'; data: NodeGraphData } | { kind: 'issue'; reason: RelationsReadIssueReason };

/** Single entry point for the relations family's data. */
export function frameToRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions,
  at?: number | null
): RelationsGraphReadResult {
  const deps: readonly unknown[] = [theme, reduceOptions, at];
  const cached = graphCache.get(frames);
  if (cached && cached.deps.every((dep, index) => Object.is(dep, deps[index]))) {
    return cached.data;
  }
  const data = computeRelationsGraph(frames, theme, reduceOptions, at);
  graphCache.set(frames, { deps, data });
  return data;
}

/** Cache the last graph for each source frame array. */
const graphCache = new WeakMap<DataFrame[], { deps: readonly unknown[]; data: RelationsGraphReadResult }>();

function computeRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions: ReduceDataOptions | undefined,
  at: number | null | undefined
): RelationsGraphReadResult {
  const roles = resolveGraphWideRoles(frames);
  if (roles) {
    const data = frameToGraphWide(frames, theme, reduceOptions, at);
    return data ? { kind: 'data', data } : { kind: 'issue', reason: 'edges-without-endpoints' };
  }
  if (isLegacyGraphFrames(frames)) {
    return { kind: 'issue', reason: 'legacy-row-data' };
  }
  if (frames.some((frame) => frame.meta?.type === GRAPH_NODES_WIDE)) {
    return { kind: 'issue', reason: 'nodes-without-edges' };
  }
  return { kind: 'issue', reason: 'unsupported-frame-shape' };
}
