import { findCategoricalFrame, mapNumericFields } from 'lib/echarts/converters/frames';
import { radarToEChartsOption } from 'lib/echarts/converters/radar';
import { getLegendOption, DEFAULT_CHART_LEGEND } from 'lib/echarts/options/legend';
import { buildRadarLegendItems } from 'lib/echarts/options/legendItems';
import { radarDefaultOptions } from 'lib/echarts/options/radar';
import { getFieldValueFormatters } from 'lib/echarts/style';
import { indexedFormatterResolver } from 'lib/echarts/tooltip/model';
import { type ChartContext, type ChartModule, type EChartRadarSeriesOption } from './types';

export const radarChartModule: ChartModule = {
  legend: DEFAULT_CHART_LEGEND,

  getTooltipValueFormatter(ctx) {
    // Each polygon is one numeric field rendered as a data item in a single
    // series, so the tooltip's `dataIndex` selects the polygon's field formatter.
    const frame = findCategoricalFrame(ctx.frames);
    const fields = frame ? mapNumericFields(frame, ctx.frames, ctx.theme).map(({ field }) => field) : [];
    const formatters = getFieldValueFormatters(fields, ctx.theme, ctx.timeZone);
    return indexedFormatterResolver(formatters, ctx.formatValue, 'dataIndex');
  },

  getTooltipFieldResolver(ctx) {
    // Same per-polygon field list as the value formatter above, keyed by
    // `dataIndex`; a polygon reduces a whole field, so links resolve at row 0.
    const frame = findCategoricalFrame(ctx.frames);
    const fields = frame ? mapNumericFields(frame, ctx.frames, ctx.theme).map(({ field }) => field) : [];
    return (item) => {
      if (item.dataIndex == null) {
        return undefined;
      }
      const field = fields[item.dataIndex];
      return field ? { field, rowIndex: 0 } : undefined;
    };
  },

  buildOption(ctx: ChartContext<'radar'>, { isGrafanaLegend }): EChartRadarSeriesOption | null {
    const { frames, theme, options, seriesType } = ctx;
    const radar = radarToEChartsOption(frames, theme);

    if (!radar) {
      return null;
    }

    return {
      ...radarDefaultOptions,
      legend: isGrafanaLegend
        ? { show: false }
        : getLegendOption(
            options.legend,
            theme,
            radar.data.map((polygon) => polygon.name)
          ),
      radar: { indicator: radar.indicator },
      series: [{ type: seriesType, data: radar.data }],
    };
  },

  buildLegendItems(ctx, calcs) {
    return buildRadarLegendItems(ctx.frames, ctx.theme, calcs, ctx.fieldConfig, ctx.timeZone);
  },
};
