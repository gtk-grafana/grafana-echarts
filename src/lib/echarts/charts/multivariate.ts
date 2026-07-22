import { PARALLEL_SMOOTH_DEFAULT } from 'editor/parallel';
import { findCategoricalFrame, mapNumericFields } from 'lib/echarts/converters/frames';
import { parallelToEChartsOption } from 'lib/echarts/converters/parallel';
import { radarToEChartsOption } from 'lib/echarts/converters/radar';
import { DEFAULT_CHART_LEGEND, resolveEChartsLegend } from 'lib/echarts/options/legend';
import { buildRadarLegendItems } from 'lib/echarts/options/legendItems';
import { getParallelComponent, getParallelLineStyle, parallelDefaultOptions } from 'lib/echarts/options/parallel';
import {
  getRadarAreaStyle,
  getRadarComponent,
  getRadarLineStyle,
  getRadarSymbol,
  radarDefaultOptions,
} from 'lib/echarts/options/radar';
import { getFieldValueFormatters } from 'lib/echarts/style';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/template';
import {
  type BaseOptionParts,
  type ChartContext,
  type ChartModule,
  type EChartParallelSeriesOption,
  type EChartRadarSeriesOption,
} from './types';

/**
 * Multivariate chart family: radar and parallel coordinates, built from the
 * *same* shared categorical model (categories -> axes, each numeric field -> one
 * series). `buildOption` dispatches on `ctx.seriesType` (mirrors
 * `hierarchyChartModule`) to pick the coordinate system. Because both render
 * types map one numeric field to one series, the shared `buildLegendItems` and
 * `getTooltipValueFormatter` (`dataIndex` -> field) serve both unchanged. See
 * `modules/multivariate/parity.md`.
 */

/** Radar render: indicators from the categories, one polygon per numeric field. */
function buildRadarOption(ctx: ChartContext, isGrafanaLegend: boolean): EChartRadarSeriesOption | null {
  const { frames, theme, options } = ctx;
  const radar = radarToEChartsOption(frames, theme);

  if (!radar) {
    return null;
  }

  // Advanced series style (fill / line width / symbol), each omitted at its
  // default so an untouched radar renders unchanged.
  const areaStyle = getRadarAreaStyle(options.radarFillArea);
  const lineStyle = getRadarLineStyle(options.radarLineWidth);
  const symbol = getRadarSymbol(options.radarSymbolSize);

  return {
    ...radarDefaultOptions,
    legend: resolveEChartsLegend(
      isGrafanaLegend,
      options.legend,
      theme,
      radar.data.map((polygon) => polygon.name)
    ),
    // Advanced shape / rings on the radar coordinate component.
    radar: getRadarComponent(radar.indicator, options.radarShape, options.radarSplitNumber),
    series: [
      {
        type: 'radar',
        data: radar.data,
        ...(areaStyle ? { areaStyle } : {}),
        ...(lineStyle ? { lineStyle } : {}),
        ...symbol,
      },
    ],
  };
}

/**
 * Parallel-coordinates render: one `parallelAxis` per category (a value axis that
 * auto-scales to its own data), one polyline per numeric field, colored by the
 * field's color via each data item's `lineStyle`.
 */
function buildParallelOption(ctx: ChartContext, isGrafanaLegend: boolean): EChartParallelSeriesOption | null {
  const { frames, theme, options } = ctx;
  const parallel = parallelToEChartsOption(frames, theme);

  if (!parallel) {
    return null;
  }

  // Advanced series style (line width / opacity) and the Default-tier smooth
  // toggle, each omitted at its default so an untouched parallel chart renders on
  // ECharts' own defaults.
  const lineStyle = getParallelLineStyle(options.parallelLineWidth, options.parallelLineOpacity);
  const smooth = options.parallelSmooth ?? PARALLEL_SMOOTH_DEFAULT;

  return {
    ...parallelDefaultOptions,
    legend: resolveEChartsLegend(
      isGrafanaLegend,
      options.legend,
      theme,
      parallel.data.map((line) => line.name)
    ),
    // The `parallel` coordinate component carries the Advanced layout; the axes
    // are their own top-level `parallelAxis` array — one value axis per category,
    // positioned by `dim`.
    parallel: getParallelComponent(options.parallelLayout),
    parallelAxis: parallel.axes.map((axis, dim) => ({ dim, name: axis.name, type: 'value' as const })),
    series: [
      {
        type: 'parallel',
        // Per-line color rides on each data item's `lineStyle.color` (the
        // documented per-line form); the series-level `lineStyle` below carries
        // the shared width/opacity.
        data: parallel.data.map((line) => ({ value: line.value, lineStyle: line.lineStyle })),
        ...(smooth ? { smooth: true } : {}),
        ...(lineStyle ? { lineStyle } : {}),
        // Place the series on its own canvas layer (see the panel's
        // `zLevel.series`), matching the other families so layered canvas capture
        // can isolate it (also what the canvas tests read).
        zlevel: options.zLevel?.series,
      },
    ],
  };
}

export const multivariateChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  getTooltipValueFormatter(ctx) {
    // Each polygon is one numeric field rendered as a data item in a single
    // series, so the tooltip's `dataIndex` selects the polygon's field formatter.
    const frame = findCategoricalFrame(ctx.frames);
    const fields = frame ? mapNumericFields(frame, ctx.frames, ctx.theme).map(({ field }) => field) : [];
    const formatters = getFieldValueFormatters(fields, ctx.theme, ctx.timeZone);
    return indexedFormatterResolver(formatters, ctx.formatValue, 'dataIndex');
  },

  buildOption(
    ctx: ChartContext,
    { isGrafanaLegend }: BaseOptionParts
  ): EChartRadarSeriesOption | EChartParallelSeriesOption | null {
    if (ctx.seriesType === 'parallel') {
      return buildParallelOption(ctx, isGrafanaLegend);
    }
    // Radar is the family default: an unset/`'Auto'` seriesType resolves to radar
    // upstream (see `resolveAutoSeriesType`), so anything not `parallel` is radar.
    return buildRadarOption(ctx, isGrafanaLegend);
  },

  buildLegendItems(ctx, calcs) {
    return buildRadarLegendItems(ctx.frames, ctx.theme, calcs, ctx.fieldConfig, ctx.timeZone);
  },
};

/**
 * Transition alias: the family was renamed from `radar` to `multivariate` to
 * make room for parallel coordinates. Kept so existing `radarChartModule`
 * references (e.g. the registry re-export) keep resolving during the transition.
 */
export const radarChartModule = multivariateChartModule;
