import { DataFrame, FieldType, getFieldDisplayName, GrafanaTheme2 } from '@grafana/data';
import { getSeriesColor } from 'echarts/style';
import { SeriesType } from 'editor/types';

/**
 * A single ECharts series built from a Grafana value field.
 *
 * Each series carries its own `[timestamp, value]` pairs so that frames with
 * non-aligned time fields (the Multi format) render correctly alongside frames
 * that share a single time field (the Wide format). ECharts aligns points by
 * timestamp on a `time` xAxis, so both layouts flow through the same path.
 *
 * `itemStyle`/`lineStyle` carry the color resolved from the field's standard
 * Color scheme config so symbols/bars and lines all match Grafana.
 */
interface EChartsTimeSeries {
  name: string;
  type: SeriesType;
  data: Array<[number, number | null]>;
  itemStyle: { color: string };
  lineStyle: { color: string };
}

/**
 * Convert Grafana time series DataFrames into an ECharts option.
 *
 * Handles both dataplane time series layouts:
 * - Wide: one frame, one shared time field, many numeric value fields.
 * - Multi: many frames, each with its own time field and value field(s).
 *
 * See https://grafana.com/developers/dataplane/timeseries
 *
 * Returns `null` when no usable (time + numeric) series can be derived, so the
 * caller can fall back to a no-data view.
 */
export function timeSeriesToEChartsOption(
  series: DataFrame[],
  seriesType: SeriesType,
  theme: GrafanaTheme2
): EChartsTimeSeries[] | null {
  const echartsSeries: EChartsTimeSeries[] = [];

  for (const frame of series) {
    const timeField = frame.fields.find((field) => field.type === FieldType.time);
    if (!timeField) {
      // A frame without a time field cannot contribute time series.
      continue;
    }

    const valueFields = frame.fields.filter((field) => field.type === FieldType.number);

    for (const valueField of valueFields) {
      const color = getSeriesColor(valueField, theme);
      echartsSeries.push({
        name: getFieldDisplayName(valueField, frame, series),
        type: seriesType,
        data: timeField.values.map((time, i) => [time, valueField.values[i] ?? null]),
        itemStyle: { color },
        lineStyle: { color },
      });
    }
  }

  if (echartsSeries.length === 0) {
    return null;
  }

  return echartsSeries;
}
