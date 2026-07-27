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
 * Emphasis (hover) state for a datapoint, applied by the tooltip's `highlight`
 * dispatch to mark the focused point — core Grafana's hover marker.
 *
 * `scale` enlarges the symbol relative to the series' `symbolSize` (6px by
 * default), which is what makes the point read as focused; for a dense line
 * whose symbols aren't rendered, ECharts creates one on demand to carry this
 * state. `focus: 'none'` keeps the other series at full opacity — ECharts would
 * otherwise dim them, which core does not do.
 *
 * The symbol inherits the series' `itemStyle.color`, so no colour is set here.
 * Bars have no symbol to scale (and `scale` is not part of their emphasis
 * options), so they keep ECharts' default emphasis; their hit area is already
 * large enough not to need a marker.
 * https://echarts.apache.org/en/option.html#series-line.emphasis
 */
const HOVER_POINT_EMPHASIS = {
  focus: 'none',
  scale: 2,
} as const;

/** Series types drawn with a symbol, so a scaled emphasis marker applies. */
function isSymbolSeriesType(type: string | undefined): type is 'line' | 'scatter' | 'effectScatter' {
  return type === 'line' || type === 'scatter' || type === 'effectScatter';
}

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
    // Annotated, not inferred: hoisting this into `common` below would otherwise
    // widen the fresh `'emphasis'` literal to `string` and stop the object
    // matching any member of the series union.
    const showEffectOn: 'emphasis' | undefined = resolvedType === 'effectScatter' ? 'emphasis' : undefined;

    const common = {
      name: getFieldDisplayName(field, frame, frames),
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      zlevel: options.zLevel?.series,
      // capture hover events on line hover
      triggerEvent: true,
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      showEffectOn,
    };

    // Split on the discriminant so `emphasis.scale` typechecks: it is a
    // symbol-only option, absent from `BarSeriesOption`, and a union-typed
    // `type` would make the literal assignable to no member of the series union.
    if (isSymbolSeriesType(type)) {
      echartsSeries.push({ ...common, type, emphasis: HOVER_POINT_EMPHASIS });
      return;
    }
    echartsSeries.push({ ...common, type });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
