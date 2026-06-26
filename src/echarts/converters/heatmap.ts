import { DataFrame, Field, FieldType, getFieldDisplayName } from '@grafana/data';
import { heatmapFrameTypes } from 'editor/series';

/**
 * A single heatmap cell with explicit bounds in data space.
 *
 * Bounds are half-open rectangles `[xStart, xEnd) x [yStart, yEnd)` in the
 * axis' native units (time in ms for X, bucket value for Y). Drawing from
 * explicit bounds lets the cell layer render on a continuous `time` x-axis via
 * a custom series, which the native ECharts heatmap can't do in this version
 * (it requires two category axes).
 */
export interface HeatmapCell {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  value: number | null;
}

/**
 * The chart-agnostic heatmap model: the cells plus the value and Y (bucket)
 * ranges needed to configure the visualMap and the bucket axis.
 */
export interface HeatmapData {
  cells: HeatmapCell[];
  /** Min/max of finite cell values, for the visualMap color range. */
  valueMin: number;
  valueMax: number;
  /** Min/max of the bucket (Y) bounds, for the heatmap value axis. */
  yMin: number;
  yMax: number;
}

/**
 * Whether a frame is a Grafana heatmap frame (heatmap-rows or heatmap-cells),
 * identified by its dataplane frame type. See
 * https://grafana.com/developers/dataplane/heatmap
 */
export function isHeatmapFrame(frame: DataFrame): boolean {
  const type = frame.meta?.type;
  return type != null && heatmapFrameTypes.includes(type);
}

/** Smallest positive gap between consecutive sorted values, for cell sizing. */
function minPositiveStep(values: number[]): number {
  const sorted = Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0 && gap < step) {
      step = gap;
    }
  }
  return Number.isFinite(step) ? step : 1;
}

function fieldByName(frame: DataFrame, name: string): Field | undefined {
  return frame.fields.find((field) => field.name === name);
}

/**
 * Heatmap-rows: the first time field is the X axis and every numeric field is a
 * bucket row. The bucket's upper bound comes from its `le` label (Prometheus
 * histogram convention); the lower bound is the previous row's upper bound. When
 * no `le` labels exist (e.g. a plain wide time series reused as heatmap-rows),
 * rows fall back to unit-height buckets indexed by field order.
 *
 * X cells span `[t, t + step)` where `step` is the smallest gap between
 * timestamps (the last column reuses the prior step).
 */
function rowsToCells(frame: DataFrame, series: DataFrame[]): HeatmapCell[] {
  const timeField = frame.fields.find((field) => field.type === FieldType.time);
  if (!timeField) {
    return [];
  }

  const numericFields = frame.fields.filter((field) => field.type === FieldType.number);
  if (numericFields.length === 0) {
    return [];
  }

  const times = timeField.values as number[];
  const xStep = minPositiveStep(times);

  // Order rows by their numeric `le` upper bound when present so stacked bucket
  // bounds are contiguous; otherwise keep field order.
  const hasLe = numericFields.some((field) => field.labels?.le != null);
  const parseLe = (field: Field, fallback: number): number => {
    const le = field.labels?.le;
    if (le == null) {
      return fallback;
    }
    const num = le === '+Inf' ? Infinity : Number(le);
    return Number.isNaN(num) ? fallback : num;
  };

  const rows = numericFields.map((field, index) => ({
    field,
    name: getFieldDisplayName(field, frame, series),
    upper: hasLe ? parseLe(field, index + 1) : index + 1,
  }));
  rows.sort((a, b) => a.upper - b.upper);

  const cells: HeatmapCell[] = [];
  for (let r = 0; r < rows.length; r++) {
    const { field, upper } = rows[r];
    const yStart = r === 0 ? 0 : rows[r - 1].upper;
    // An open-ended (+Inf) top bucket reuses the previous bucket's height so it
    // stays visible rather than spanning to infinity.
    const prevHeight = r === 0 ? 1 : rows[r - 1].upper - (r === 1 ? 0 : rows[r - 2].upper);
    const yEnd = Number.isFinite(upper) ? upper : yStart + prevHeight;

    for (let i = 0; i < times.length; i++) {
      const value = field.values[i];
      cells.push({
        xStart: times[i],
        xEnd: times[i] + xStep,
        yStart,
        yEnd,
        value: typeof value === 'number' ? value : null,
      });
    }
  }

  return cells;
}

/**
 * Heatmap-cells: one row per cell. X bounds come from `xMin`/`xMax` when present
 * (sparse layout) or from the center `x`/time field +/- half the inferred step.
 * Y bounds come from `yMin`/`yMax` or the center `y` field +/- half its step.
 * The first value field that isn't an axis-bound field is the displayed value.
 */
function cellsToCells(frame: DataFrame): HeatmapCell[] {
  const xMin = fieldByName(frame, 'xMin');
  const xMax = fieldByName(frame, 'xMax');
  const xCenter = fieldByName(frame, 'x') ?? frame.fields.find((field) => field.type === FieldType.time);

  const yMin = fieldByName(frame, 'yMin');
  const yMax = fieldByName(frame, 'yMax');
  const yCenter = fieldByName(frame, 'y');

  const axisNames = new Set(['x', 'xMin', 'xMax', 'y', 'yMin', 'yMax']);
  const valueField = frame.fields.find(
    (field) =>
      field.type === FieldType.number && !axisNames.has(field.name) && field !== xCenter && field !== yCenter
  );

  if (!valueField) {
    return [];
  }

  const rowCount = frame.length;
  const xStep = xCenter ? minPositiveStep(xCenter.values as number[]) : 1;
  const yStep = yCenter ? minPositiveStep(yCenter.values as number[]) : 1;

  const cells: HeatmapCell[] = [];
  for (let i = 0; i < rowCount; i++) {
    const xs = xMin ? Number(xMin.values[i]) : xCenter ? Number(xCenter.values[i]) - xStep / 2 : i;
    const xe = xMax ? Number(xMax.values[i]) : xCenter ? Number(xCenter.values[i]) + xStep / 2 : i + 1;
    const ys = yMin ? Number(yMin.values[i]) : yCenter ? Number(yCenter.values[i]) - yStep / 2 : i;
    const ye = yMax ? Number(yMax.values[i]) : yCenter ? Number(yCenter.values[i]) + yStep / 2 : i + 1;
    const value = valueField.values[i];

    cells.push({
      xStart: xs,
      xEnd: xe,
      yStart: ys,
      yEnd: ye,
      value: typeof value === 'number' ? value : null,
    });
  }

  return cells;
}

/**
 * Convert Grafana heatmap frames (heatmap-rows and/or heatmap-cells) into the
 * common cell model plus the value and bucket ranges. Multiple heatmap frames
 * are merged into a single cell set.
 *
 * Returns `null` when no usable cells can be derived, so the caller can skip the
 * heatmap layer.
 */
export function frameToHeatmap(frames: DataFrame[], series: DataFrame[] = frames): HeatmapData | null {
  const cells: HeatmapCell[] = [];

  for (const frame of frames) {
    if (frame.meta?.type === 'heatmap-cells') {
      cells.push(...cellsToCells(frame));
    } else {
      // heatmap-rows (and timeseries-wide reused as rows).
      cells.push(...rowsToCells(frame, series));
    }
  }

  if (cells.length === 0) {
    return null;
  }

  let valueMin = Infinity;
  let valueMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const cell of cells) {
    if (cell.value != null && Number.isFinite(cell.value)) {
      valueMin = Math.min(valueMin, cell.value);
      valueMax = Math.max(valueMax, cell.value);
    }
    if (Number.isFinite(cell.yStart)) {
      yMin = Math.min(yMin, cell.yStart);
    }
    if (Number.isFinite(cell.yEnd)) {
      yMax = Math.max(yMax, cell.yEnd);
    }
  }

  if (!Number.isFinite(valueMin)) {
    valueMin = 0;
    valueMax = 0;
  }
  if (!Number.isFinite(yMin)) {
    yMin = 0;
    yMax = 1;
  }

  return { cells, valueMin, valueMax, yMin, yMax };
}
