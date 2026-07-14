import { type DataFrame, type Field, type GrafanaTheme2 } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import {
  findCategoricalFrame,
  findCategoryField,
  mapNumericFields,
  resolveCategoriesFromField,
} from 'lib/echarts/converters/frames';

/**
 * A single matrix heatmap cell as the tuple the native ECharts heatmap series
 * consumes: `[xIndex, yIndex, value]`, where the indices point into the X/Y
 * category arrays. `value` is `null` for missing/non-finite entries so the tile
 * renders empty rather than as 0.
 * https://echarts.apache.org/en/option.html#series-heatmap.data
 */
export type MatrixHeatmapCell = [number, number, number | null];

/**
 * The chart-agnostic matrix heatmap model: the category labels for both axes and
 * the cell tuples, plus the value range needed to size the visualMap.
 */
export interface MatrixHeatmapData {
  /** X-axis categories: the display name of each numeric field (one column). */
  xCategories: string[];
  /** Y-axis categories: the string field's row values (one row per data row). */
  yCategories: string[];
  cells: MatrixHeatmapCell[];
  /** Min/max of finite cell values, for the visualMap color range. */
  valueMin: number;
  valueMax: number;
  xField: Field<number>;
  yField: Field<string>;
}

/**
 * Convert Grafana frames into the matrix heatmap model using the wide/pivot
 * shape: the first frame's string field supplies the Y (row) categories and
 * each numeric field is an X (column) category labelled by its display name. A
 * cell at column `c`, row `r` holds that numeric field's value at row `r`.
 *
 * This reuses the shared categorical model helpers (see
 * echarts/converters/frames.ts and echarts/converters/categorical.ts) so the
 * category resolution matches the cartesian category charts.
 *
 * Returns `null` when no frame has a numeric field, so the caller can render an
 * empty panel.
 */
export function frameToMatrixHeatmap(frames: DataFrame[], theme: GrafanaTheme2): MatrixHeatmapData | null {
  const frame = findCategoricalFrame(frames);
  if (!frame) {
    debug('matrix frame is empty', LOG_LEVELS.debug);
    return null;
  }

  const numericFields = mapNumericFields(frame, frames, theme);
  const xField = numericFields[0].field;

  if (numericFields.length === 0 || !xField) {
    debug('matrix heatmap has no numeric field', LOG_LEVELS.info);
    return null;
  }

  const yField = findCategoryField(frame);
  const yCategories = resolveCategoriesFromField(yField);

  if (!yField) {
    debug('matrix heatmap has no category field', LOG_LEVELS.info);
    return null;
  }

  const xCategories = numericFields.map(({ name }) => name);

  const cells: MatrixHeatmapCell[] = [];
  let valueMin = Infinity;
  let valueMax = -Infinity;

  for (let c = 0; c < numericFields.length; c++) {
    const { field } = numericFields[c];
    for (let r = 0; r < yCategories.length; r++) {
      const raw = field.values[r];
      const value = Number.isFinite(raw) ? raw : null;
      if (value != null) {
        valueMin = Math.min(valueMin, value);
        valueMax = Math.max(valueMax, value);
      } else {
        debug('invalid matrix cell value', LOG_LEVELS.debug, { raw });
      }
      cells.push([c, r, value]);
    }
  }

  if (!Number.isFinite(valueMin)) {
    valueMin = 0;
    valueMax = 0;
    debug('Matrix: unable to calculate min value', LOG_LEVELS.warn, { valueMin });
  }

  return { xCategories, yCategories, cells, valueMin, valueMax, xField, yField };
}
