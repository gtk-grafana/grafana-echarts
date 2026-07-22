import { type Field, getFieldDisplayName } from '@grafana/data';
import { STACK_GROUP_ID } from 'editor/cartesian';
import { type CartesianSingleValueSeriesType, type EChartsFieldConfig, type HeatmapSeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext, type EChartSingleValueCartesianSeries } from 'lib/echarts/charts/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { buildCartesianSeries } from 'lib/echarts/options/cartesian';
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
    const name = getFieldDisplayName(field, frame, frames);
    const data = timeField.values.map((time, i) => [time, field.values[i] ?? null]);
    const zlevel = options.zLevel?.series;

    // A heatmap-overlay field is not a cartesian series type (`series.type` is
    // omitted), so it keeps the minimal color-only style rather than the Advanced
    // cartesian options.
    if (resolvedType === 'heatmap') {
      echartsSeries.push({ name, type: undefined, data, itemStyle: { color }, lineStyle: { color }, zlevel });
      return;
    }

    // Cartesian series get the Advanced value-label / geometry / style options
    // (each omitted at its default). Only bar supports stacking.
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);
    echartsSeries.push(
      buildCartesianSeries(
        { name, data, color, zlevel, ...(stacked ? { stack: STACK_GROUP_ID } : {}) },
        resolvedType,
        options,
        theme
      )
    );
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
