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


type XAxisValue = number;
type YAxisValue = number | null;
interface EChartsTimeSeries {
  name: string;
  type: SeriesType;
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
