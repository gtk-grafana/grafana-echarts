import { type DataFrame, type Field, FieldType } from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import { frameToNodeGraph, getNodeGraphValueField, isEdgesFrame } from 'lib/echarts/converters/nodeGraph';
import {
  getGraphSeries,
  makeRelationsColorResolver,
  relationsDefaultOptions,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { type ChartModule, type EChartGraphSeriesOption, type RelationsChartContext } from './types';

/**
 * The edges frame's `mainstat`, used to format a hovered link's value and resolve
 * its data links. Distinct from the node `mainstat` that
 * `getNodeGraphValueField` prefers.
 */
function getLinkValueField(frames: DataFrame[]): Field | undefined {
  const edgesFrame = frames.find(isEdgesFrame);
  const mainstat = edgesFrame?.fields.find((field) => field.name.toLowerCase() === 'mainstat');
  return mainstat?.type === FieldType.number ? mainstat : undefined;
}

/**
 * Relations chart family: nodes plus the links between them, built from Grafana's
 * node-graph frame pair (see echarts/converters/nodeGraph.ts).
 *
 * Only the `graph` render variant ships today. `sankey` and `chord` are planned
 * variants of this same module — all three ECharts series read the identical
 * node/link input — and will dispatch on `ctx.seriesType` here, the way the
 * hierarchy module picks treemap vs sunburst.
 */
export const relationsChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(ctx: RelationsChartContext, _base): EChartGraphSeriesOption | null {
    const data = frameToNodeGraph(ctx.frames, ctx.theme);
    if (!data) {
      return null;
    }

    const seriesCtx: RelationsSeriesContext = {
      ...ctx,
      valueField: getNodeGraphValueField(ctx.frames),
      linkValueField: getLinkValueField(ctx.frames),
    };

    return { ...relationsDefaultOptions, series: [getGraphSeries(data, seriesCtx)] };
  },

  buildLegendItems(ctx): VizLegendItem[] {
    const data = frameToNodeGraph(ctx.frames, ctx.theme);
    if (!data) {
      return [];
    }

    // One entry per node, colored by the same resolver the chart uses so the
    // swatches match: a fixed-color override wins, then the node's own `color`
    // field, then the value field's by-value scheme, then the classic palette.
    const resolveColor = makeRelationsColorResolver(ctx.theme, ctx.fieldConfig, getNodeGraphValueField(ctx.frames));
    return data.nodes.map((node, index) => ({
      label: node.name,
      fieldName: node.name,
      color: resolveColor(node, index),
      yAxis: 1,
      getItemKey: () => `relations-${node.id}`,
      getDisplayValues: () => [],
    }));
  },

  // A relations hover is always a single node or link, so an "All" tooltip has
  // nothing to list. Set here as well as via the editor's `singleOnly`, so a
  // dashboard saved with `tooltip.mode: multi` is clamped back rather than
  // building an axis trigger (the gap hierarchy deliberately left open).
  singleTooltipOnly: true,
};
