import { DataFrame, Field, FieldType, getFieldDisplayName } from '@grafana/data';

/**
 * A single radar axis.
 *
 * `name` is the label drawn at the tip of the axis, and `max` (optional) fixes
 * the outer bound of that axis. When `max` is omitted, ECharts auto-scales the
 * axis from the data, which is why we only set it when we actually have data.
 *
 * See https://echarts.apache.org/en/option.html#radar.indicator
 */
export interface RadarIndicator {
  name: string;
  max?: number;
}

/**
 * A single radar polygon (one closed shape on the chart).
 *
 * `value` is positional: `value[i]` corresponds to `indicator[i]`. A `null`
 * entry leaves a gap on that axis rather than plotting a zero.
 *
 * See https://echarts.apache.org/en/option.html#series-radar.data
 */
export interface RadarPolygon {
  name: string;
  value: Array<number | null>;
}

/**
 * The two data-dependent pieces a radar chart needs: the shared axis definition
 * (`indicator`) and the polygons drawn against it (`data`). The caller merges
 * these into a base radar option.
 */
export interface RadarData {
  indicator: RadarIndicator[];
  data: RadarPolygon[];
}

/**
 * Convert Grafana data frames into the pieces required by an ECharts radar
 * chart.
 *
 * Mapping (rows = axes, numeric fields = polygons):
 * - The first string field's row values become the radar axes (indicators).
 *   With no string field we fall back to row indices ("0", "1", ...).
 * - Each numeric field becomes one polygon, whose positional `value` array is
 *   that field's values across the rows.
 * - Each indicator's `max` is the largest value any polygon takes on that axis,
 *   so the outer ring fits the data; left undefined when there is no numeric
 *   data for that axis (ECharts then auto-scales).
 *
 * See https://grafana.com/developers/dataplane/ and
 * https://echarts.apache.org/en/option.html#radar
 *
 * Design trade-offs and risks:
 * - Single frame only: radar compares a handful of dimensions for a few
 *   entities, so we use the first frame that has at least one numeric field and
 *   ignore the rest. Multi-frame responses (e.g. the time series Multi format)
 *   are NOT merged; callers that need that must pre-transform their data.
 * - Time fields are ignored. Radar is not a time-based visualization; feeding it
 *   raw time series usually produces a meaningless star with one axis per
 *   timestamp. This converter does not guard against that beyond ignoring the
 *   time field itself.
 * - Indicators are positional. All polygons share the single indicator list
 *   derived from the chosen frame, so every numeric field is assumed to align
 *   row-for-row with the category field. Fields of differing lengths would
 *   yield `undefined` -> `null` entries on the longer axes.
 * - High axis counts (many rows) degrade readability; we do not cap the number
 *   of indicators here.
 *
 * Returns `null` when no frame has a numeric field, so the caller can fall back
 * to a no-data view.
 */
export function radarToEChartsOption(series: DataFrame[]): RadarData | null {
  // Radar needs at least one numeric field to draw a polygon. Pick the first
  // frame that qualifies and ignore the rest (see trade-offs above).
  const frame = series.find((candidate) => candidate.fields.some((field) => field.type === FieldType.number));

  if (!frame) {
    return null;
  }

  const numericFields = frame.fields.filter((field) => field.type === FieldType.number);
  const categoryField = frame.fields.find((field) => field.type === FieldType.string);

  // Each row maps to one axis. Prefer human-readable category names; otherwise
  // fall back to the row index so the chart still renders.
  const axisCount = frame.length;
  const indicatorNames: string[] = Array.from({ length: axisCount }, (_, row) =>
    categoryField ? String(categoryField.values[row] ?? row) : String(row)
  );

  const polygons: RadarPolygon[] = numericFields.map((field: Field) => ({
    name: getFieldDisplayName(field, frame, series),
    // `?? null` coerces missing/undefined cells to a gap while preserving 0.
    value: Array.from({ length: axisCount }, (_, row) => field.values[row] ?? null),
  }));

  const indicator: RadarIndicator[] = indicatorNames.map((name, row) => {
    // Per-axis max = the largest value any polygon takes on this axis. Undefined
    // when no polygon has a numeric value here so ECharts can auto-scale.
    let max: number | undefined = undefined;
    for (const polygon of polygons) {
      const value = polygon.value[row];
      if (value !== null && (max === undefined || value > max)) {
        max = value;
      }
    }

    return max === undefined ? { name } : { name, max };
  });

  return { indicator, data: polygons };
}
