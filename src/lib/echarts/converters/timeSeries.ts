import { type Field, getFieldDisplayName } from '@grafana/data';
import { STACK_GROUP_ID } from 'editor/constants';
import { type CartesianSingleValueSeriesType, type EChartsFieldConfig, type HeatmapSeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext, type EChartSingleValueCartesianSeries } from 'lib/echarts/charts/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';
import { getFieldConfigFromField } from 'lib/grafana/fields/fieldConfig';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * Resolve the series type for a single value field: field override wins when cartesian.
 */
function resolveFieldSeriesType<T>(field: Field, defaultType: T): T | CartesianSingleValueSeriesType {
  const seriesTypeOverride = getFieldConfigFromField(field).custom?.seriesType;
  if (seriesTypeOverride && isCartesianSingleValueSeriesType(seriesTypeOverride)) {
    return seriesTypeOverride;
  }
  return defaultType;
}
/**
 * Whether a bar field should stack: field override wins over the panel default.
 * Only bar series stack, so callers gate on the resolved render type.
 */
function resolveFieldStack(field: Field, panelStack = false): boolean {
  const override = getFieldConfigFromField(field).custom?.stackSeries;
  return override ?? panelStack;
}

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 */
export function timeSeriesToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType | HeatmapSeriesType>
): EChartSingleValueCartesianSeries[] | null {
  const { frames: rawFrames, theme, options, seriesType } = ctx;

  const frames: Array<FieldTypedDataFrame<string | number, EChartsFieldConfig>> = rawFrames;
  const echartsSeries: EChartSingleValueCartesianSeries[] = [];

  forEachTimeSeriesField(frames, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    const resolvedType = resolveFieldSeriesType<CartesianSingleValueSeriesType | HeatmapSeriesType>(field, seriesType);
    // Only bar supports stacked
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);
    // Heatmap doesn't support series.type
    const type = resolvedType === 'heatmap' ? undefined : resolvedType;
    // Only effectScatter supports showEffectOn
    // https://echarts.apache.org/en/option.html#series-effectScatter.showEffectOn
    const showEffectOn = resolvedType === 'effectScatter' ? 'emphasis' : undefined;

    echartsSeries.push({
      name: getFieldDisplayName(field, frame, frames),
      type,
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      zlevel: options.zLevel?.series,
      // capture hover events on line hover
      triggerEvent: true,
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      showEffectOn,
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
