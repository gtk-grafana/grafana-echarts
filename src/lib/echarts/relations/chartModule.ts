import { type FieldConfigSource } from '@grafana/data';
import { type VizLegendItem } from '@grafana/ui';
import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';

import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';
import { type NodeGraphData } from 'lib/echarts/relations/converters/model';
import { getChordSeries } from 'lib/echarts/relations/options/chord';
import { getGraphSeries, relationsDefaultOptions } from 'lib/echarts/relations/options/graph';
import { resolveRelationsTimeSlider } from 'lib/echarts/relations/options/timeSlider';
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { getSankeyDroppedNoticeText, getSankeySeries } from 'lib/echarts/relations/options/sankey';

import { getHiddenSeriesNames, getMarkPositionOverride } from 'lib/grafana/fields/seriesConfig';
import {
  type ChartModule,
  type ChartNotice,
  type ChartZoomAction,
  type EChartChordSeriesOption,
  type EChartGraphSeriesOption,
  type EChartSankeySeriesOption,
  type LegendHighlightTarget,
  type RelationsChartContext,
} from 'lib/echarts/charts/types';

import { graphWideTimeline } from 'lib/echarts/relations/converters/timeStops';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { resolveRelationsZoom } from 'lib/echarts/relations/options/view';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';

/** Ids of every node hidden from the visualization. */
function hiddenNodeIds(data: NodeGraphData, fieldConfig: FieldConfigSource): Set<string> {
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

/** The graph as rendered: hidden marks removed. */
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
    ...data,
    nodes: data.nodes.filter((node) => !hidden.has(node.id) && (node.field != null || connected.has(node.id))),
    links,
  };
}

/** Pinned positions for derived nodes. */
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

/** The node/link model as rendered: hidden marks and their orphaned links removed. */
function getVisibleNodeGraph(ctx: RelationsChartContext): NodeGraphData | null {
  const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
  return data == null ? null : withOverriddenPositions(withoutHiddenMarks(data, ctx.fieldConfig), ctx.fieldConfig);
}

/** Build a relations chart from Grafana's field-based graph contract. */
export const relationsChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(
    ctx: RelationsChartContext,
    { plotHeight }
  ): EChartGraphSeriesOption | EChartSankeySeriesOption | EChartChordSeriesOption | null {
    const data = getVisibleNodeGraph(ctx);
    if (!data) {
      return null;
    }

    // Build tooltip metadata only for visible marks.
    const seriesCtx: RelationsSeriesContext = {
      ...ctx,
      marks: getRelationsTooltipMarks(data, ctx.theme, ctx.timeZone),
    };

    if (ctx.seriesType === 'sankey') {
      // ECharts sankey layouts reject cycles. Report any removed links as notices.
      const { series } = getSankeySeries(data, seriesCtx);
      return { ...relationsDefaultOptions, series: [series] };
    }

    // Chord accepts cyclic data.
    if (ctx.seriesType === 'chord') {
      return { ...relationsDefaultOptions, series: [getChordSeries(data, seriesCtx)] };
    }

    return { ...relationsDefaultOptions, series: [getGraphSeries(data, seriesCtx, plotHeight)] };
  },

  /** Report data that the panel cannot draw as requested. */
  getNotices(ctx: RelationsChartContext): ChartNotice[] {
    const notices: ChartNotice[] = [];

    if (resolveRelationsTimeSlider(ctx.options) && this.getTimeline?.(ctx) == null) {
      notices.push({
        severity: 'info',
        text: 'This query returns one value per mark, so there is no timeline to step through. Marks are read as they are; switch the time slider off to choose a calculation.',
      });
    }

    if (ctx.seriesType === 'sankey') {
      // Count removed links after hidden marks are filtered.
      const data = getVisibleNodeGraph(ctx);
      const text = data ? getSankeyDroppedNoticeText(toSankeyLinks(data.links).droppedCount) : null;
      if (text != null) {
        notices.push({ severity: 'warning', text });
      }
    }

    return notices;
  },

  /** The timestamps the panel's slider can step through, or `null` for no slider. */
  getTimeline(ctx: RelationsChartContext): number[] | null {
    if (!resolveRelationsTimeSlider(ctx.options)) {
      return null;
    }
    const timeline = graphWideTimeline(ctx.frames);
    return timeline.length > 1 ? timeline : null;
  },

  /** The roam action the panel's zoom buttons dispatch, when zoom is switched on. */
  getZoomAction(ctx: RelationsChartContext): ChartZoomAction | undefined {
    if (!resolveRelationsZoom(ctx.options) || ctx.seriesType === 'chord') {
      return undefined;
    }
    // The family emits exactly one series per render, whichever variant is selected.
    return { type: ctx.seriesType === 'sankey' ? 'sankeyRoam' : 'graphRoam', seriesIndex: 0 };
  },

  /** Emphasize a legend node and its links. */
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

  /** Nodes and edges, because both are fields and the legend lists only nodes. */
  getOverrideTargetNames(ctx: RelationsChartContext): string[] {
    const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
    if (!data) {
      return [];
    }
    // Overrides match node display names and edge field names.
    return [...data.nodes.map((node) => node.name), ...data.links.map((link) => link.field?.name ?? link.id)];
  },

  buildLegendItems(ctx): VizLegendItem[] {
    // Keep hidden nodes in the legend so users can show them again.
    const data = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
    if (!data) {
      return [];
    }

    const hidden = hiddenNodeIds(data, ctx.fieldConfig);
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
