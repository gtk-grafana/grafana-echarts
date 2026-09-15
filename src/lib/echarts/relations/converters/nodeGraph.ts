import { type DataFrame, type GrafanaTheme2, type ReduceDataOptions } from '@grafana/data';
import { frameToGraphWide } from 'lib/echarts/relations/converters/graphWide';
import { isLegacyGraphFrames } from 'lib/echarts/relations/converters/legacyToWide';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';

import { isGraphWideFrames } from 'lib/echarts/relations/converters/frameRoles';

/** Single entry point for the relations family's data. */
export function frameToRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions?: ReduceDataOptions,
  at?: number | null
): NodeGraphData | null {
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
const graphCache = new WeakMap<DataFrame[], { deps: readonly unknown[]; data: NodeGraphData | null }>();

function computeRelationsGraph(
  frames: DataFrame[],
  theme: GrafanaTheme2,
  reduceOptions: ReduceDataOptions | undefined,
  at: number | null | undefined
): NodeGraphData | null {
  if (isGraphWideFrames(frames)) {
    return frameToGraphWide(frames, theme, reduceOptions, at);
  }
  if (isLegacyGraphFrames(frames)) {
    throw new Error(
      'Row-based node-graph frames need converting to the field-based graph contract before the panel can read them. ' +
        'This normally happens automatically (Grafana 13.2+); on an older host, add a "Rows to fields" transformation.'
    );
  }
  return null;
}
