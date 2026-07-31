import { type DataFrame, type Field, type FieldConfigSource, FieldType } from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import {
  frameToNodeGraph,
  getNodeGraphValueField,
  isEdgesFrame,
  type NodeGraphData,
} from 'lib/echarts/converters/nodeGraph';
import {
  getGraphSeries,
  makeRelationsColorResolver,
  relationsDefaultOptions,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { getChordSeries } from 'lib/echarts/options/chord';
import { toSankeyLinks } from 'lib/echarts/converters/dag';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getSankeyDroppedNoticeText, getSankeySeries } from 'lib/echarts/options/sankey';
import { getHiddenSeriesNames } from 'lib/grafana/fields/seriesConfig';
import {
  type ChartModule,
  type ChartNotice,
  type EChartChordSeriesOption,
  type EChartGraphSeriesOption,
  type EChartSankeySeriesOption,
  type LegendHighlightTarget,
  type RelationsChartContext,
} from './types';

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
 * Drop the nodes the legend has hidden, and every link that touched one.
 *
 * Legend rows here are nodes — frame *rows*, not fields — so Grafana's override
 * engine has nothing to apply `custom.hideFrom` to and the family reads the
 * override itself, exactly as pie does for slices (`converters/pie.ts`). Matching
 * is by display name, which is what `buildLegendItems` puts in `fieldName`.
 *
 * Links go too: an edge whose endpoint is gone has nothing to attach to, and
 * ECharts resolves links by node id, so leaving it would either drop it silently
 * (graph) or leave a ribbon hanging off a node that is not drawn.
 *
 * Each surviving node keeps its position in the unfiltered list as `paletteIndex`,
 * so hiding a node does not shuffle the palette colors of the ones after it.
 */
function withoutHiddenNodes(data: NodeGraphData, fieldConfig: FieldConfigSource): NodeGraphData {
  const hiddenNames = getHiddenSeriesNames(
    fieldConfig,
    data.nodes.map((node) => node.name)
  );
  if (hiddenNames.size === 0) {
    return data;
  }

  const hiddenIds = new Set(data.nodes.filter((node) => hiddenNames.has(node.name)).map((node) => node.id));
  return {
    nodes: data.nodes
      .map((node, index) => ({ ...node, paletteIndex: index }))
      .filter((node) => !hiddenIds.has(node.id)),
    links: data.links.filter((link) => !hiddenIds.has(link.source) && !hiddenIds.has(link.target)),
  };
}

/** The node/link model as rendered: legend-hidden nodes and their links removed. */
function getVisibleNodeGraph(ctx: RelationsChartContext): NodeGraphData | null {
  const data = frameToNodeGraph(ctx.frames, ctx.theme);
  return data == null ? null : withoutHiddenNodes(data, ctx.fieldConfig);
}

/**
 * Relations chart family: nodes plus the links between them, built from Grafana's
 * node-graph frame pair (see echarts/converters/nodeGraph.ts).
 *
 * All three render variants ship, and `ctx.seriesType` selects between them the way
 * the hierarchy module picks treemap vs sunburst. Every ECharts series here reads the
 * identical node/link input, so a variant is a layout change rather than a data
 * change — with one exception: `sankey` cannot draw a cycle, so its path rewrites the
 * link set first (`converters/dag.ts`). `graph` and `chord` take any digraph.
 */
export const relationsChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(
    ctx: RelationsChartContext,
    _base
  ): EChartGraphSeriesOption | EChartSankeySeriesOption | EChartChordSeriesOption | null {
    const data = getVisibleNodeGraph(ctx);
    if (!data) {
      return null;
    }

    const seriesCtx: RelationsSeriesContext = {
      ...ctx,
      valueField: getNodeGraphValueField(ctx.frames),
      linkValueField: getLinkValueField(ctx.frames),
    };

    if (ctx.seriesType === 'sankey') {
      // `getSankeySeries` breaks cycles itself — ECharts' sankey layout throws on
      // cyclic input even in production. How many links that cost is reported
      // separately, through `getNotices` below, rather than drawn on the canvas.
      const { series } = getSankeySeries(data, seriesCtx);
      return { ...relationsDefaultOptions, series: [series] };
    }

    // Chord takes the model unchanged: it has no DAG restriction, so cyclic
    // service-graph data needs no rewriting and there is nothing to report.
    if (ctx.seriesType === 'chord') {
      return { ...relationsDefaultOptions, series: [getChordSeries(data, seriesCtx)] };
    }

    return { ...relationsDefaultOptions, series: [getGraphSeries(data, seriesCtx)] };
  },

  /**
   * Only the sankey variant reports anything: it is the one render path that
   * rewrites the user's link set (`converters/dag.ts`) to satisfy ECharts'
   * acyclic layout, so the panel says so rather than silently dropping edges.
   * `graph` and `chord` take any digraph and have nothing to report.
   */
  getNotices(ctx: RelationsChartContext): ChartNotice[] {
    if (ctx.seriesType !== 'sankey') {
      return [];
    }
    // The *visible* graph, so the count matches the ribbons actually drawn:
    // hiding a node can remove the very link the cycle policy would have cut.
    const data = getVisibleNodeGraph(ctx);
    if (!data) {
      return [];
    }
    const text = getSankeyDroppedNoticeText(toSankeyLinks(data.links).droppedCount);
    return text != null ? [{ severity: 'warning', text }] : [];
  },

  /**
   * Emphasise the hovered legend row's node **and every link touching it**, which
   * is what makes a legend hover useful on a topology — the node alone says little.
   *
   * Indices address the rendered series, so they are taken from the visible graph:
   * `data`/`links` are built from it in the same order (`toNodeItems` /
   * `toLinkItems`), and the two tables are addressed separately through ECharts'
   * `dataType` discriminator.
   */
  getLegendHighlightTargets(ctx: RelationsChartContext, label: string): LegendHighlightTarget[] {
    const data = getVisibleNodeGraph(ctx);
    const nodeIndex = data?.nodes.findIndex((node) => node.name === label) ?? -1;
    if (data == null || nodeIndex < 0) {
      return [];
    }

    const id = data.nodes[nodeIndex].id;
    const edgeIndices = data.links.reduce<number[]>((out, link, index) => {
      if (link.source === id || link.target === id) {
        out.push(index);
      }
      return out;
    }, []);

    const targets: LegendHighlightTarget[] = [{ dataType: 'node', dataIndex: [nodeIndex] }];
    if (edgeIndices.length > 0) {
      targets.push({ dataType: 'edge', dataIndex: edgeIndices });
    }
    return targets;
  },

  buildLegendItems(ctx): VizLegendItem[] {
    // The *unfiltered* graph: a hidden node stays listed (greyed) so it can be
    // toggled back on, which is how every other family's legend behaves.
    const data = frameToNodeGraph(ctx.frames, ctx.theme);
    if (!data) {
      return [];
    }

    const hidden = getHiddenSeriesNames(
      ctx.fieldConfig,
      data.nodes.map((node) => node.name)
    );
    // One entry per node, colored by the same resolver the chart uses so the
    // swatches match: a fixed-color override wins, then the node's own `color`
    // field, then the value field's by-value scheme, then the classic palette.
    const resolveColor = makeRelationsColorResolver(ctx.theme, ctx.fieldConfig, getNodeGraphValueField(ctx.frames));
    return data.nodes.map((node, index) => ({
      label: node.name,
      fieldName: node.name,
      color: resolveColor(node, index),
      yAxis: 1,
      disabled: hidden.has(node.name),
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
