import { type Field, getFieldDisplayName, type GrafanaTheme2 } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { findCategoryField, resolveCategoriesFromFrame } from 'lib/echarts/converters/frames';
import { getSeriesColor } from 'lib/echarts/style';
import { isNumberField } from 'lib/grafana/narrowing';
import { type EChartsFrame } from 'lib/grafana/types';

/**
 * The resolved series/category model for a category-axis cartesian chart.
 *
 * This is the single source of truth for *which* series the chart emits and in
 * *what order*. Three separate derivations have to agree on that order — the
 * converter (ECharts `series`), `cartesianSeriesFields` (`yAxisIndex`, tooltip
 * value formatters, and the tooltip field resolver), and the legend builder —
 * because each zips its own result against the series index positionally. They
 * all read this model rather than re-deriving from frames, so the order cannot
 * drift between them.
 *
 * Unlike the shared `frameToCategorical` (radar / parallel / hierarchy), this
 * model spans **every** frame. See `framesToCategoryCartesian` for the contract.
 */
export interface CategoryCartesianSeries {
  /** Source field, so callers can read per-field config (overrides, unit, links). */
  field: Field<number>;
  name: string;
  color: string;
  /**
   * Values positioned against {@link CategoryCartesianModel.categories}. `null`
   * marks a category this series' frame has no row for, which ECharts renders as
   * a gap rather than a zero.
   */
  values: Array<number | null>;
}

export interface CategoryCartesianModel {
  categories: string[];
  series: CategoryCartesianSeries[];
}

/** Numeric value fields of a frame paired with their display name and color. */
function frameValueFields(frame: EChartsFrame, frames: EChartsFrame[], theme: GrafanaTheme2) {
  return frame.fields.filter(isNumberField).map((field) => ({
    field,
    name: getFieldDisplayName(field, frame, frames),
    color: getSeriesColor(field, theme),
  }));
}

/**
 * Row index of each category label in a frame, for the label-keyed join.
 *
 * Duplicate labels within one frame make the join ambiguous, so the first row
 * wins and the rest are dropped with a warning — silently plotting the last one
 * would hide the fact that data was discarded.
 */
function rowIndexByCategory(labels: string[], frameName: string): Map<string, number> {
  const rows = new Map<string, number>();
  let duplicates = 0;
  for (let i = 0; i < labels.length; i++) {
    if (rows.has(labels[i])) {
      duplicates++;
      continue;
    }
    rows.set(labels[i], i);
  }
  if (duplicates > 0) {
    debug(
      `Categorical-x: ${duplicates} duplicate category label(s) in frame "${frameName}" ignored; the first row wins`,
      LOG_LEVELS.warn,
      labels
    );
  }
  return rows;
}

/**
 * Build the category-axis cartesian model from every frame in the response.
 *
 * Two shapes, because merging is only needed (and only unambiguous) when more
 * than one frame carries values:
 *
 * - **One value frame** — categories are that frame's labels verbatim and each
 *   numeric field keeps its values positionally. Duplicate labels are preserved
 *   (ECharts allows repeated category ticks), so this is byte-for-byte what the
 *   single-frame model always produced.
 * - **Several value frames** — the "one frame per series" shape Grafana's Multi
 *   format and per-series datasources return. Categories are the union of every
 *   frame's labels in first-appearance order, and each series is joined onto them
 *   **by label** rather than by row position, so frames may list categories in
 *   different orders or cover different subsets. A category a frame has no row for
 *   yields `null` (a gap). Duplicate labels within a frame collapse to the first
 *   row (see {@link rowIndexByCategory}).
 *
 * Frames with no numeric field contribute no series. A frame with no string field
 * falls back to row indices for its labels (`"0"`, `"1"`, ...), which degrades the
 * join to positional — the same fallback the single-frame model uses.
 *
 * Returns `null` when no frame has a numeric field, so callers can keep the axis
 * and render nothing.
 *
 * See https://grafana.com/developers/dataplane/
 */
export function framesToCategoryCartesian(frames: EChartsFrame[], theme: GrafanaTheme2): CategoryCartesianModel | null {
  const valueFrames = frames.filter((frame) => frame.fields.some(isNumberField));

  if (valueFrames.length === 0) {
    return null;
  }

  // Single frame: positional passthrough, duplicates intact.
  if (valueFrames.length === 1) {
    const frame = valueFrames[0];
    return {
      categories: resolveCategoriesFromFrame(frame),
      series: frameValueFields(frame, frames, theme).map(({ field, name, color }) => ({
        field,
        name,
        color,
        values: Array.from(field.values),
      })),
    };
  }

  // Several frames: union the labels in first-appearance order, then join each
  // frame's values onto that shared axis by label.
  const categories: string[] = [];
  const seen = new Set<string>();
  const frameLabels = valueFrames.map((frame) => resolveCategoriesFromFrame(frame));

  for (const labels of frameLabels) {
    for (const label of labels) {
      if (!seen.has(label)) {
        seen.add(label);
        categories.push(label);
      }
    }
  }

  const series: CategoryCartesianSeries[] = [];
  valueFrames.forEach((frame, frameIndex) => {
    // A frame with no string field was labelled by row index above, so its join
    // keys are those indices and the lookup stays positional.
    const rows = rowIndexByCategory(frameLabels[frameIndex], frame.name ?? frame.refId ?? `frame ${frameIndex}`);

    for (const { field, name, color } of frameValueFields(frame, frames, theme)) {
      const values: Array<number | null> = categories.map((category) => {
        const row = rows.get(category);
        return row == null ? null : (field.values[row] ?? null);
      });
      series.push({ field, name, color, values });
    }
  });

  return { categories, series };
}

/**
 * The numeric value fields backing the chart's series, in emit order. Kept beside
 * the model so the axis / tooltip / legend derivations cannot fall out of step
 * with the converter (see {@link CategoryCartesianModel}).
 */
export function categoryCartesianFields(frames: EChartsFrame[], theme: GrafanaTheme2): Field[] {
  return framesToCategoryCartesian(frames, theme)?.series.map(({ field }) => field) ?? [];
}

/**
 * Category labels to keep on the axis when the model yields no series at all
 * (every series hidden via the legend strips the numeric fields). Falls back to
 * any frame that still has a string field, else the first frame's row indices.
 */
export function fallbackCategories(frames: EChartsFrame[]): string[] {
  const categoryFrame = frames.find((frame) => findCategoryField(frame)) ?? frames[0];
  return categoryFrame ? resolveCategoriesFromFrame(categoryFrame) : [];
}
