import { type DataFrame, type Field, getFieldDisplayName, type GrafanaTheme2 } from '@grafana/data';
import { type ScatterSeriesOption } from 'echarts';
import { type CandlestickSeriesOption } from 'echarts/types/src/chart/candlestick/CandlestickSeries';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { type EChartsFieldConfig, type SeriesType } from 'editor/types';
import { cartesianTimeSeriesTypes, STACK_GROUP_ID } from 'editor/constants';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';

/**
 * Resolve the series type for a single value field: field override wins when cartesian.
 */
function resolveFieldSeriesType(field: Field, defaultType: SeriesType): SeriesType {
  const override = (field.config.custom as EChartsFieldConfig | undefined)?.seriesType;
  if (override && cartesianTimeSeriesTypes.includes(override)) {
    return override;
  }
  return defaultType;
}

// MOVE
/**
 * Whether a bar field should stack: field override wins over the panel default.
 * Only bar series stack, so callers gate on the resolved render type.
 */
function resolveFieldStack(field: Field, panelStack: boolean): boolean {
  const override = (field.config.custom as EChartsFieldConfig | undefined)?.stackSeries;
  return override ?? panelStack;
}


/** X of each cartesian `[x, y]` data item: epoch ms timestamp. */
type XAxisValue = number;
/** Y of each cartesian `[x, y]` data item; `null` renders a gap rather than a zero. */
type YAxisValue = number | null;
interface EChartsTimeSeries {
  name: string;
  type: SeriesType;
  /**
   * Data items as `[time, value]` tuples (x = epoch ms, y = number | null).
   * ECharts echoes the same tuple back as the tooltip hover param's `value`,
   * where it is normalized into a `TimeSeriesPoint` (see echarts/tooltip).
   * See https://echarts.apache.org/en/option.html#series-line.data
   */
  data: Array<[XAxisValue, YAxisValue]>;
  itemStyle: { color: string };
  lineStyle: { color: string };
  /**
   * ECharts stack group id. Bar series sharing the same value are stacked; unset
   * for unstacked or non-bar series.
   * https://echarts.apache.org/en/option.html#series-bar.stack
   */
  stack?: string;
}

// MOVE

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 * @todo take context instead of fn params
 */
export function timeSeriesToEChartsOption(
  series: DataFrame[],
  seriesType: SeriesType,
  theme: GrafanaTheme2,
  zlevel?: number
): Array<LineSeriesOption | CandlestickSeriesOption | ScatterSeriesOption> | null {
  const echartsSeries: LineSeriesOption[] = [];

  forEachTimeSeriesField(series, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    const type = resolveFieldSeriesType(field, seriesType);
    const stacked = type === 'bar' && resolveFieldStack(field, panelStack);

    echartsSeries.push({
      name: getFieldDisplayName(field, frame, series),
      // @todo fix types
      // @ts-expect-error
      type,
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      zlevel,
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
