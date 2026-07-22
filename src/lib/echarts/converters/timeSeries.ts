import { type Field, getFieldDisplayName } from '@grafana/data';
import { type DatasetComponentOption } from 'echarts';
import { STACK_GROUP_ID } from 'editor/constants';
import { type CartesianSingleValueSeriesType, type EChartsFieldConfig, type HeatmapSeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext, type EChartSingleValueCartesianSeries } from 'lib/echarts/charts/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getSeriesPerfOptions, getSeriesStats } from 'lib/echarts/options/performance';
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

/** Dimension name of the shared time/X column in a frame's columnar dataset. */
const TIME_DIM = 'time';
/** Dimension name of one value column, unique within its frame's dataset (by field index). */
const valueDim = (fieldIndex: number): string => `v${fieldIndex}`;

/**
 * Keyed-column dataset `source`: dimension name → the DataFrame column, held by
 * reference. Matches ECharts' `OptionSourceDataKeyedColumns`
 * (`Dictionary<ArrayLike<OptionDataValue>>`).
 */
type ColumnarSource = Record<string, ArrayLike<string | number | null | undefined>>;

/**
 * Time-series converter output: the ECharts series plus the per-frame columnar
 * `dataset` the series read via `datasetIndex`/`encode`. Kept together so the
 * chart builder threads both into the option (see `buildTimeOption`).
 */
export interface TimeSeriesEChartsResult {
  series: EChartSingleValueCartesianSeries[];
  dataset: DatasetComponentOption[];
}

/**
 * Convert Grafana time series DataFrames into ECharts series + dataset.
 *
 * Data is fed via one columnar `dataset` per source frame (keyed-column
 * `source`, referencing the DataFrame's existing arrays directly — no per-point
 * `[time, value]` tuples are allocated) and per-series `encode`/`datasetIndex`.
 * ECharts parses `null`/`undefined`/`NaN`/`''` holes as gaps (see its
 * `parseDataValue`), so gaps render exactly as the old inline-tuple path did
 * while values pass through zero-copy.
 *
 * Series carry the type-aware performance props from `getSeriesPerfOptions`
 * (symbols off / LTTB for dense lines; `large` for dense scatter/bar), computed
 * once from the whole frame set so a dense chart switches every series onto the
 * fast path consistently.
 */
export function timeSeriesToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType | HeatmapSeriesType>
): TimeSeriesEChartsResult | null {
  const { frames: rawFrames, theme, options, seriesType } = ctx;

  const frames: Array<FieldTypedDataFrame<string | number, EChartsFieldConfig>> = rawFrames;
  const series: EChartSingleValueCartesianSeries[] = [];
  const dataset: DatasetComponentOption[] = [];

  // Density signal (series count + densest series) drives the fast-path props;
  // computed once so all series resolve against the same stats.
  const stats = getSeriesStats(rawFrames);

  // One columnar dataset per source frame, created lazily on the frame's first
  // value field. Wide frames (shared time, many values) reuse one dataset; the
  // multi-frame shape yields one dataset per frame. The `columns` object is the
  // same reference held by the pushed dataset entry, so adding value columns to
  // it fills that dataset's `source` in place. Keyed by frame index.
  const frameColumns = new Map<number, { index: number; columns: ColumnarSource }>();

  forEachTimeSeriesField(frames, ({ frame, frameIndex, field, fieldIndex, timeField }) => {
    let entry = frameColumns.get(frameIndex);
    if (!entry) {
      // Reference the DataFrame's time column directly (zero-copy).
      const columns: ColumnarSource = { [TIME_DIM]: timeField.values };
      entry = { index: dataset.length, columns };
      dataset.push({ source: columns });
      frameColumns.set(frameIndex, entry);
    }
    // Reference the value column directly under a per-field-unique dimension.
    const dim = valueDim(fieldIndex);
    entry.columns[dim] = field.values;

    const color = getSeriesColor(field, theme);
    const resolvedType = resolveFieldSeriesType<CartesianSingleValueSeriesType | HeatmapSeriesType>(field, seriesType);
    // Only bar supports stacked
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);
    // Heatmap doesn't support series.type
    const type = resolvedType === 'heatmap' ? undefined : resolvedType;
    // Only effectScatter supports showEffectOn
    // https://echarts.apache.org/en/option.html#series-effectScatter.showEffectOn
    const showEffectOn = resolvedType === 'effectScatter' ? 'emphasis' : undefined;

    series.push({
      name: getFieldDisplayName(field, frame, frames),
      type,
      // Read x/y from the frame's columnar dataset instead of inline tuples.
      datasetIndex: entry.index,
      encode: { x: TIME_DIM, y: dim },
      itemStyle: { color },
      lineStyle: { color },
      // @todo only set default if more then 50 series @todo perf test
      // All series share one canvas (`zlevel` 1)
      zlevel: options.zLevel?.series ?? 1,
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      // Type-aware fast-path props (symbols/sampling for line; large for scatter/bar).
      ...getSeriesPerfOptions({ type: resolvedType, maxPoints: stats.maxPoints, options }),
      showEffectOn,
    });
  });

  if (series.length === 0) {
    return null;
  }

  return { series, dataset };
}
