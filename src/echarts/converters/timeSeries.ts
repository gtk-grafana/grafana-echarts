import { DataFrame, getFieldDisplayName, GrafanaTheme2 } from '@grafana/data';
import { forEachTimeSeriesField } from 'echarts/converters/frames';
import { getSeriesColor } from 'echarts/style';
import { cartesianTimeSeriesTypes } from 'editor/series';
import { EChartsFieldConfig, SeriesType } from 'editor/types';

/**
 * Resolve the series type for a single value field: field override wins when cartesian.
 */
function resolveFieldSeriesType(field: import('@grafana/data').Field, defaultType: SeriesType): SeriesType {
  const override = (field.config.custom as EChartsFieldConfig | undefined)?.seriesType;
  if (override && cartesianTimeSeriesTypes.includes(override)) {
    return override;
  }
  return defaultType;
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
}

/**
 * Convert Grafana time series DataFrames into ECharts series data.
 */
export function timeSeriesToEChartsOption(
  series: DataFrame[],
  seriesType: SeriesType,
  theme: GrafanaTheme2
): EChartsTimeSeries[] | null {
  const echartsSeries: EChartsTimeSeries[] = [];

  forEachTimeSeriesField(series, ({ frame, field, timeField }) => {
    const color = getSeriesColor(field, theme);
    echartsSeries.push({
      name: getFieldDisplayName(field, frame, series),
      type: resolveFieldSeriesType(field, seriesType),
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
