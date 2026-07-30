import { getFieldDisplayName } from '@grafana/data';
import { STACK_GROUP_ID } from 'editor/cartesian';
import { type CartesianSingleValueSeriesType, type EChartsFieldConfig, type HeatmapSeriesType } from 'editor/types';
import { type ChartContext, type EChartSingleValueCartesianSeries } from 'lib/echarts/charts/types';
import { resolveFieldSeriesType, resolveFieldStack } from 'lib/echarts/converters/fieldOverrides';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { buildCartesianSeries } from 'lib/echarts/options/cartesian';
import { getSeriesDensity, getSeriesPerfOptions } from 'lib/echarts/performance/resolvers';
import { getSeriesColor } from 'lib/echarts/style';
import { type FieldTypedDataFrame } from 'lib/grafana/types';

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 *
 * Data is emitted as inline `[time, value]` tuples.
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
    const data = timeField.values.map((time, i) => [time, field.values[i] ?? null]);
    const zlevel = options.zLevel?.series;
    // Type-aware fast-path props (symbols/sampling for line; large for
    // scatter/bar). `values` lets the symbol decision spare a series that draws
    // no line, which would otherwise render as nothing at all.
    const perf = getSeriesPerfOptions({ type: resolvedType, density, options, values: field.values });

    // A heatmap-overlay field is not a cartesian series type (`series.type` is
    // omitted), so it keeps the minimal color-only style rather than the Advanced
    // cartesian options — and gets no fast-path props, which are all cartesian.
    // It still captures hover events so the tooltip can read it.
    if (resolvedType === 'heatmap') {
      echartsSeries.push({
        name,
        type: undefined,
        data,
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
    const stacked = resolvedType === 'bar' && resolveFieldStack(field, options.stackSeries);
    echartsSeries.push(
      buildCartesianSeries(
        { name, data, color, zlevel, perf, hover: true, ...(stacked ? { stack: STACK_GROUP_ID } : {}) },
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
