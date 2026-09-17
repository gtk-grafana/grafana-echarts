import { type FieldConfigSource } from '@grafana/data';

import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { type RelationsChartContext } from 'lib/echarts/charts/types';
import { getHiddenSeriesNames, getMarkPositionOverride } from 'lib/grafana/fields/seriesConfig';
import { getRelationsMarkLimitIssue } from 'lib/echarts/relations/markLimits';
import { type VisibleRelationsGraphResult } from 'lib/echarts/relations/types';

/** IDs of all nodes that the visualization hides. */
export function getHiddenNodeIds(data: NodeGraphData, fieldConfig: FieldConfigSource): Set<string> {
  const derived = data.nodes.filter((node) => node.field == null);
  // Derived nodes have no field, so resolve their overrides by name.
  const hiddenDerived =
    derived.length > 0
      ? getHiddenSeriesNames(
          fieldConfig,
          derived.map((node) => node.name)
        )
      : new Set<string>();

  const hidden = new Set<string>();
  for (const node of data.nodes) {
    if (node.field != null ? node.hidden === true : hiddenDerived.has(node.name)) {
      hidden.add(node.id);
    }
  }
  return hidden;
}

/** Remove the marks that the field configuration hides. */
function withoutHiddenMarks(data: NodeGraphData, fieldConfig: FieldConfigSource): NodeGraphData {
  const hidden = getHiddenNodeIds(data, fieldConfig);
  const links = data.links.filter(
    (link) => link.hidden !== true && !hidden.has(link.source) && !hidden.has(link.target)
  );
  if (hidden.size === 0 && links.length === data.links.length) {
    return data;
  }

  const connected = new Set(links.flatMap((link) => [link.source, link.target]));
  return {
    ...data,
    nodes: data.nodes.filter((node) => !hidden.has(node.id) && (node.field != null || connected.has(node.id))),
    links,
  };
}

/** Apply pinned positions to derived nodes. */
function withOverriddenPositions(data: NodeGraphData, fieldConfig: FieldConfigSource): NodeGraphData {
  if (fieldConfig.overrides.length === 0 || data.nodes.every((node) => node.field != null)) {
    return data;
  }
  return {
    ...data,
    nodes: data.nodes.map((node) => {
      if (node.field != null) {
        return node;
      }
      const pinned = getMarkPositionOverride(fieldConfig, node.id) ?? getMarkPositionOverride(fieldConfig, node.name);
      return pinned ? { ...node, fixedX: pinned.x, fixedY: pinned.y } : node;
    }),
  };
}

/** True when ECharts can draw a mark for the selected variant. */
function isRenderable(data: NodeGraphData, seriesType: RelationsChartContext['seriesType']): boolean {
  // Chord needs a link for its circular layout. Graph and Sankey can draw an isolated node.
  return seriesType === 'chord' ? data.links.length > 0 : data.nodes.length > 0;
}

/** Read the graph and apply the visibility rules that the renderer uses. */
export function getVisibleRelationsGraph(ctx: RelationsChartContext): VisibleRelationsGraphResult {
  const result = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
  if (result.kind === 'issue') {
    return result;
  }

  const data = withOverriddenPositions(withoutHiddenMarks(result.data, ctx.fieldConfig), ctx.fieldConfig);
  if (!isRenderable(data, ctx.seriesType)) {
    return { kind: 'issue', reason: 'hidden-marks' };
  }
  const details = getRelationsMarkLimitIssue(data, ctx);
  return details == null ? { kind: 'data', data } : { kind: 'issue', reason: 'mark-limit', details };
}
