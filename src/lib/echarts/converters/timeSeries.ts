import { type DataFrame, type Field, getFieldDisplayName, type GrafanaTheme2 } from '@grafana/data';
import { cartesianTimeSeriesTypes, STACK_GROUP_ID } from 'editor/constants';
import { forEachTimeSeriesField } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';
import { type EChartsFieldConfig, type SeriesType } from 'editor/types';

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

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 *
 * `panelStack` is the panel-level stacking default; a per-field `stackSeries`
 * override wins. Stacking is applied only to fields that render as `bar`.
 */
export function timeSeriesToEChartsOption(
  series: DataFrame[],
  seriesType: SeriesType,
  theme: GrafanaTheme2,
  panelStack = false
): EChartsTimeSeries[] | null {
  const echartsSeries: EChartsTimeSeries[] = [];

  forEachTimeSeriesField(series, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    const type = resolveFieldSeriesType(field, seriesType);
    const stacked = type === 'bar' && resolveFieldStack(field, panelStack);
    echartsSeries.push({
      name: getFieldDisplayName(field, frame, series),
      type,
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      ...(stacked ? { stack: STACK_GROUP_ID } : {}),
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
