import { type Field, getFieldDisplayName } from '@grafana/data';
import { STACK_GROUP_ID } from 'editor/cartesian';
import { type CartesianSingleValueSeriesType, type EChartsFieldConfig, type HeatmapSeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext, type EChartSingleValueCartesianSeries } from 'lib/echarts/charts/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { buildCartesianSeries } from 'lib/echarts/options/cartesian';
import { getSeriesDensity, getSeriesPerfOptions } from 'lib/echarts/performance/resolvers';
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
 * Flat `[t0, v0, t1, v1, …]` interleaving of a series' time and value columns.
 * Missing values become `NaN`, which ECharts treats as a gap the same way it
 * treats `null` in tuple form. Epoch-millisecond timestamps rule out `Float32`
 * (24-bit mantissa), so the buffer is always `Float64Array`.
 */
function toInterleavedData(times: readonly number[], values: ReadonlyArray<number | string>): Float64Array {
  const data = new Float64Array(times.length * 2);
  for (let i = 0; i < times.length; i++) {
    const value = values[i];
    data[i * 2] = times[i];
    data[i * 2 + 1] = typeof value === 'number' ? value : NaN;
  }
  return data;
}

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 *
 * Cartesian data is emitted as one flat, interleaved `Float64Array` per series
 * (see `toInterleavedData`) with `dimensions` declared — ECharts'
 * `SOURCE_FORMAT_TYPED_ARRAY` path. Unlike the tuple form, its provider is
 * `pure`/`persistent: false`, so `DataStore` fills its typed chunks in a single
 * numeric pass and does not retain the source; the per-point tuple allocation
 * (and its GC churn on dense charts) disappears. The heatmap overlay branch
 * keeps tuples: it is small and its series carry no `type`.
 * https://echarts.apache.org/en/option.html#series-line.data
 *
 * Series carry the type-aware performance props from `getSeriesPerfOptions`
 * (symbols off / LTTB for dense lines; `large` for dense scatter/bar), computed
 * once from the whole frame set so a dense chart switches every series onto the
 * fast path consistently.
 */
export function timeSeriesToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType | HeatmapSeriesType>
): EChartSingleValueCartesianSeries[] | null {
  const { frames: rawFrames, theme, options, seriesType } = ctx;

  const frames: Array<FieldTypedDataFrame<string | number, EChartsFieldConfig>> = rawFrames;
  const echartsSeries: EChartSingleValueCartesianSeries[] = [];

  // Density (total points + densest series) drives the fast-path props; computed
  // once over the whole frame set so every series resolves against the same
  // numbers and a chart never renders half on the fast path.
  const density = getSeriesDensity(rawFrames);

  forEachTimeSeriesField(frames, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    const resolvedType = resolveFieldSeriesType<CartesianSingleValueSeriesType | HeatmapSeriesType>(field, seriesType);
    const name = getFieldDisplayName(field, frame, frames);
    const zlevel = options.zLevel?.series;
    // Type-aware fast-path props (symbols/sampling for line; large for
    // scatter/bar). `values` lets the symbol decision spare a series that draws
    // no line, which would otherwise render as nothing at all.
    const perf = getSeriesPerfOptions({ type: resolvedType, density, options, values: field.values });

    // A heatmap-overlay field is not a cartesian series type (`series.type` is
    // omitted), so it keeps the minimal color-only style rather than the Advanced
    // cartesian options — and gets no fast-path props, which are all cartesian.
    // It still captures hover events so the tooltip can read it. Kept on tuples:
    // its data volume is small and the typed-array path requires a series type.
    if (resolvedType === 'heatmap') {
      echartsSeries.push({
        name,
        type: undefined,
        data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
        itemStyle: { color },
        lineStyle: { color },
        zlevel,
        triggerEvent: true,
      });
      return;
    }

    // Cartesian series get the Advanced value-label / geometry / style options
    // (each omitted at its default) composed with the fast-path props. Only bar
    // supports stacking. `hover` arms the tooltip seam — `triggerEvent` plus, on
    // symbol types, the scaled emphasis marker the `highlight` dispatch drives.
    // `dimensions` is required by the typed-array data path (ECharts cannot
    // infer the dimension count from a flat buffer).
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);
    echartsSeries.push(
      buildCartesianSeries(
        {
          name,
          data: toInterleavedData(timeField.values, field.values),
          dimensions: ['time', 'value'],
          color,
          zlevel,
          perf,
          hover: true,
          ...(stacked ? { stack: STACK_GROUP_ID } : {}),
        },
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
