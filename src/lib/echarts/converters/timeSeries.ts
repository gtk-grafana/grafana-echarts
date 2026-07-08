import { type Field, getFieldDisplayName } from '@grafana/data';
import { type ScatterSeriesOption } from 'echarts';
import { type CandlestickSeriesOption } from 'echarts/types/src/chart/candlestick/CandlestickSeries';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { STACK_GROUP_ID } from 'editor/constants';
import { type CartesianSingleValueSeriesType, type HeatmapSeriesType, type SeriesType } from 'editor/types';
import { isCartesianSingleValueSeriesType } from 'lib/echarts/charts/narrowing';
import { type ChartContext } from 'lib/echarts/charts/types';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';
import { getFieldConfigFromField } from 'lib/grafana/fields/fieldConfig';

/**
 * Resolve the series type for a single value field: field override wins when cartesian.
 */
function resolveFieldSeriesType(field: Field, defaultType: SeriesType): SeriesType {
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
 * @todo take context instead of fn params
 */
export function timeSeriesToEChartsOption(
  ctx: ChartContext<CartesianSingleValueSeriesType | HeatmapSeriesType>
): Array<LineSeriesOption | CandlestickSeriesOption | ScatterSeriesOption> | null {
  const { frames, theme, options, seriesType } = ctx;
  const echartsSeries: LineSeriesOption[] = [];

  forEachTimeSeriesField(frames, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    const type = resolveFieldSeriesType(field, seriesType);
    const stacked = type === 'bar' && resolveFieldStack(field, options.stackSeries);

    echartsSeries.push({
      name: getFieldDisplayName(field, frame, frames),
      // @todo fix types
      // @ts-expect-error
      type,
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      zlevel: options.zLevel?.series,
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
      // effectScatter ripples continuously with the default `showEffectOn: 'render'`,
      // which never lets the chart settle. Trigger the ripple on hover instead so
      // the render animation completes (and the points draw as static markers).
      // https://echarts.apache.org/en/option.html#series-effectScatter.showEffectOn
      ...(type === 'effectScatter' ? { showEffectOn: 'emphasis' } : {}),
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
