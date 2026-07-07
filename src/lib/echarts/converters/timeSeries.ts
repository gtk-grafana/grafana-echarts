import { type DataFrame, type Field, getFieldDisplayName, type GrafanaTheme2 } from '@grafana/data';
import { type ScatterSeriesOption } from 'echarts';
import { type CandlestickSeriesOption } from 'echarts/types/src/chart/candlestick/CandlestickSeries';
import { type LineSeriesOption } from 'echarts/types/src/chart/line/LineSeries';
import { cartesianTimeSeriesTypes } from 'editor/constants';
import { type EChartsFieldConfig, type SeriesType } from 'editor/types';
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

    echartsSeries.push({
      name: getFieldDisplayName(field, frame, series),
      // @todo fix types
      // @ts-expect-error
      type,
      data: timeField.values.map((time, i) => [time, field.values[i] ?? null]),
      itemStyle: { color },
      lineStyle: { color },
      zlevel,
    });
  });

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
