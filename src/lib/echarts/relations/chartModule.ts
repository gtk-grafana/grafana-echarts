import { type VizLegendItem } from '@grafana/ui';

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
import { DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { type RelationsSeriesContext } from 'lib/echarts/relations/context';
import { toSankeyLinks } from 'lib/echarts/relations/converters/dag';

import { frameToRelationsGraph } from 'lib/echarts/relations/converters/nodeGraph';

import { graphWideTimeline } from 'lib/echarts/relations/converters/timeStops';
import { getChordSeries } from 'lib/echarts/relations/options/chord';
import { getGraphSeries, relationsDefaultOptions } from 'lib/echarts/relations/options/graph';
import { getSankeyDroppedNoticeText, getSankeySeries } from 'lib/echarts/relations/options/sankey';
import { resolveRelationsTimeSlider } from 'lib/echarts/relations/options/timeSlider';
import { resolveRelationsZoom } from 'lib/echarts/relations/options/view';
import { getRelationsTooltipMarks } from 'lib/echarts/relations/tooltip/marks';
import { getHiddenNodeIds, getVisibleRelationsGraph } from 'lib/echarts/relations/visibleGraph';

const ISSUE_MESSAGES = {
  'unsupported-frame-shape': 'Graph data is missing edges. Add source and target labels to each numeric edge field.',
  'nodes-without-edges': 'Graph data contains nodes but no edges. Add an edges frame.',
  'edges-without-endpoints':
    'Graph edge fields are missing endpoints. Add source and target labels to each numeric edge field.',
  'legacy-row-data':
    'Row-based Node Graph data was not converted. Add a Rows to fields transformation, or enable panel system transformations in Grafana.',
  'hidden-marks': 'All graph marks are hidden. Show at least one node or edge in the field configuration.',
};

/** Build a relations chart from Grafana's field-based graph contract. */
export const relationsChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  buildOption(
    ctx: RelationsChartContext,
    { plotHeight }
  ): EChartGraphSeriesOption | EChartSankeySeriesOption | EChartChordSeriesOption | null {
    const result = getVisibleRelationsGraph(ctx);
    if (result.kind === 'issue') {
      return null;
    }
    const { data } = result;

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

  /** Explain why the selected variant cannot draw the response. */
  getDataIssue(ctx: RelationsChartContext) {
    const result = getVisibleRelationsGraph(ctx);
    return result.kind === 'issue' ? { reason: result.reason, message: ISSUE_MESSAGES[result.reason] } : undefined;
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
      const result = getVisibleRelationsGraph(ctx);
      const text =
        result.kind === 'data' ? getSankeyDroppedNoticeText(toSankeyLinks(result.data.links).droppedCount) : null;
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
    const result = getVisibleRelationsGraph(ctx);
    if (result.kind === 'issue') {
      return [];
    }
    const { data } = result;
    const nodeIndex = data.nodes.findIndex((node) => node.name === label);
    if (nodeIndex < 0) {
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
    const result = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
    if (result.kind === 'issue') {
      return [];
    }
    const { data } = result;
    // Overrides match node display names and edge field names.
    return [...data.nodes.map((node) => node.name), ...data.links.map((link) => link.field?.name ?? link.id)];
  },

  buildLegendItems(ctx): VizLegendItem[] {
    // Keep hidden nodes in the legend so users can show them again.
    const result = frameToRelationsGraph(ctx.frames, ctx.theme, ctx.options.reduceOptions, ctx.selectedTime);
    if (result.kind === 'issue') {
      return [];
    }
    const { data } = result;

    const hidden = getHiddenNodeIds(data, ctx.fieldConfig);
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
