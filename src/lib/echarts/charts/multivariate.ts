import { findCategoricalFrame, mapNumericFields } from 'lib/echarts/converters/frames';
import { radarToEChartsOption } from 'lib/echarts/converters/radar';
import { DEFAULT_CHART_LEGEND, resolveEChartsLegend } from 'lib/echarts/options/legend';
import { buildRadarLegendItems } from 'lib/echarts/options/legendItems';
import {
  getRadarAreaStyle,
  getRadarComponent,
  getRadarLineStyle,
  getRadarSymbol,
  radarDefaultOptions,
} from 'lib/echarts/options/radar';
import { getFieldValueFormatters } from 'lib/echarts/style';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/template';
import { type BaseOptionParts, type ChartContext, type ChartModule, type EChartRadarSeriesOption } from './types';

/**
 * Multivariate chart family: radar today, with parallel coordinates as the
 * roadmap second render type. `buildOption` dispatches on `ctx.seriesType`
 * (mirrors `hierarchyChartModule`), so a `parallel` branch can slot in beside
 * radar without disturbing routing. See `modules/multivariate/parity.md` for the
 * exact drop-in steps.
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

  buildOption(ctx: ChartContext, { isGrafanaLegend }: BaseOptionParts): EChartRadarSeriesOption | null {
    if (ctx.seriesType === 'radar') {
      return buildRadarOption(ctx, isGrafanaLegend);
    }
    // parallel: roadmap — a `parallel` branch builds the parallel-coordinates
    // option here (see modules/multivariate/parity.md).
    return null;
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
