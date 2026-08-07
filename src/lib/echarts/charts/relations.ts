import { type FieldConfigSource } from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import { toSankeyLinks } from 'lib/echarts/converters/dag';
import { frameToRelationsGraph } from 'lib/echarts/converters/relationsGraph';
import { type NodeGraphData } from 'lib/echarts/converters/relationsModel';
import { getChordSeries } from 'lib/echarts/options/chord';
import {
  getGraphSeries,
  relationsDefaultOptions,
  resolveRelationsZoom,
  type RelationsSeriesContext,
} from 'lib/echarts/options/graph';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getSankeyDroppedNoticeText, getSankeySeries } from 'lib/echarts/options/sankey';
import { getRelationsTooltipMarks } from 'lib/echarts/tooltip/relations';
import { getHiddenSeriesNames } from 'lib/grafana/fields/seriesConfig';
import {
  type ChartModule,
  type ChartNotice,
  type ChartZoomAction,
  type EChartChordSeriesOption,
  type EChartGraphSeriesOption,
  type EChartSankeySeriesOption,
  type LegendHighlightTarget,
  type RelationsChartContext,
} from './types';

/**
 * Ids of every node hidden from the visualization.
 *
 * A node with a field of its own has already answered: `custom.hideFrom.viz` was
 * matched and applied to it by Grafana's override engine, and the reader read it
 * straight off the mark (`RelationNode.hidden`). That covers both writers — the
 * legend's visibility toggle and a hand-written "Hide in area" override — and it
 * covers matchers a by-name lookup never could, `byRegexp` and `byType` among them.
 *
 * A node **derived** from an edge's endpoints has no field, so nothing could have
 * been applied to it and its name is the only thing left to match on. This is the
 * same hole as `relations-data-links.md` gap 4, which is why the by-name read
 * survives here in miniature rather than disappearing outright: without it, a legend
 * click on an edges-only response would do nothing at all.
 */
function hiddenNodeIds(data: NodeGraphData, fieldConfig: FieldConfigSource): Set<string> {
  const derived = data.nodes.filter((node) => node.field == null);
  // Resolved over the derived names alone — the universe the override can still be
  // interpreted against, since `hideSeriesFrom` is an *exclude* matcher and needs a
  // candidate list. The fielded nodes are excluded because they have answered already.
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

/**
 * The graph as rendered: hidden marks removed.
 *
 * Three things go, and only the first is a field-config question:
 *
 * - a mark whose own field is hidden — node **or edge**, which is new: an edge is a
 *   field now, so "Hide in area" on `a-->b` removes exactly that edge;
 * - every link touching a hidden node, because an edge with a missing endpoint has
 *   nothing to attach to and ECharts resolves links by node id, so leaving it would
 *   either drop it silently (graph) or hang a ribbon off nothing;
 * - a **derived** node left with no visible link, because such a node exists only as
 *   a consequence of its edges — hiding the last edge that named it should not leave
 *   an unexplained dot behind. A node the nodes frame declared stays, links or not.
 *
 * Colours survive untouched: the reader resolved each node's colour before this ran
 * (`fillPaletteColors`), so hiding a node cannot shuffle the palette colours below it.
 */
function withoutHiddenMarks(data: NodeGraphData, fieldConfig: FieldConfigSource): NodeGraphData {
  const hidden = hiddenNodeIds(data, fieldConfig);
  const links = data.links.filter(
    (link) => link.hidden !== true && !hidden.has(link.source) && !hidden.has(link.target)
  );
  if (hidden.size === 0 && links.length === data.links.length) {
    return data;
  }

  const connected = new Set(links.flatMap((link) => [link.source, link.target]));
  return {
    nodes: data.nodes.filter((node) => !hidden.has(node.id) && (node.field != null || connected.has(node.id))),
    links,
  };
}

/** The node/link model as rendered: hidden marks and their orphaned links removed. */
function getVisibleNodeGraph(ctx: RelationsChartContext): NodeGraphData | null {
  const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions);
  return data == null ? null : withoutHiddenMarks(data, ctx.fieldConfig);
}

/**
 * Relations chart family: nodes plus the links between them, built from Grafana's
 * the field-based graph contract (see echarts/converters/graphWide.ts).
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

    // Every mark's own display processor and link source, resolved once for all
    // three variants: the tooltip formats a hovered node or edge with its own unit
    // and surfaces its own `config.links`. Built from the *visible* graph, which is
    // the only set that can be hovered.
    const seriesCtx: RelationsSeriesContext = {
      ...ctx,
      marks: getRelationsTooltipMarks(data, ctx.theme, ctx.timeZone),
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
   * The roam action the panel's zoom buttons dispatch, when zoom is switched on.
   *
   * Chord is excluded and that is a hard exclusion, not a preference: `ChordSeries`
   * pins `coordinateSystem: 'none'` and declares no `roam` at all, so there is no view
   * to scale and no action registered for it. `graph` and `sankey` each register one
   * (`registerRoamActionSimply`), named after the series type.
   */
  getZoomAction(ctx: RelationsChartContext): ChartZoomAction | undefined {
    if (!resolveRelationsZoom(ctx.options) || ctx.seriesType === 'chord') {
      return undefined;
    }
    // The family emits exactly one series per render, whichever variant is selected.
    return { type: ctx.seriesType === 'sankey' ? 'sankeyRoam' : 'graphRoam', seriesIndex: 0 };
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

  /**
   * Nodes **and** edges, because both are fields and the legend lists only nodes.
   *
   * The legend toggle writes an exclude-mode `byNames` override, so any mark left out
   * of the kept list is hidden by Grafana. Without the edge names here, hiding one
   * node would mark every edge field `hideFrom.viz` and the panel would lose all its
   * links — see {@link ChartModule.getOverrideTargetNames}. The *unfiltered* graph,
   * so an already-hidden mark stays in the universe and can be restored.
   */
  getOverrideTargetNames(ctx: RelationsChartContext): string[] {
    const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions);
    if (!data) {
      return [];
    }
    // Nodes by display name (what the legend shows and the matcher tests), edges by
    // field name — an edge has no display name of its own.
    //
    // `link.field?.name` first, spelling out that the universe is **field names**: this
    // list feeds an exclude matcher, so anything in it that no field answers to would
    // stop covering the edge fields and hiding one node would erase every link in the
    // panel. `link.id` is that name by contract; the read says so rather than relying on
    // it. Never `markKey`, which is an item key and matches nothing. Duplicates are fine
    // — `byNames` holds a `Set`, and a repeated `Value` matches every edge field anyway.
    return [...data.nodes.map((node) => node.name), ...data.links.map((link) => link.field?.name ?? link.id)];
  },

  buildLegendItems(ctx): VizLegendItem[] {
    // The *unfiltered* graph: a hidden node stays listed (greyed) so it can be
    // toggled back on, which is how every other family's legend behaves.
    const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions);
    if (!data) {
      return [];
    }

    // Greyed by the same resolution the chart filters on, so a row cannot say
    // "visible" about a node that is not drawn.
    const hidden = hiddenNodeIds(data, ctx.fieldConfig);
    // One entry per node
    return data.nodes.map((node) => ({
      label: node.name,
      fieldName: node.name,
      color: node.color,
      yAxis: 1,
      disabled: hidden.has(node.id),
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
