import { type AbsoluteTimeRange, type GrafanaTheme2 } from '@grafana/data';
import { debug, LOG_LEVELS } from 'development';
import { type BrushOption } from 'echarts/types/dist/shared';
import { type BrushAreaParam } from 'echarts/types/src/component/brush/BrushModel';

// Grafana-style drag-to-zoom for time-axis panels. A `lineX` brush lets the user
// drag a horizontal span over the time axis; on release we translate the
// selection into an absolute time range and hand it to Grafana (which refetches
// and re-renders the whole dashboard), rather than zooming ECharts locally.
// This mirrors how core panels drive the shared dashboard time range.
//
// The brush is driven programmatically via `takeGlobalCursor` (see the ENABLE
// action) instead of a toolbox, so no brush buttons are rendered.
// https://echarts.apache.org/en/option.html#brush

export type BrushEndEvent = { areas: BrushAreaParam[] };
/**
 * ECharts `brush` config bound to the primary time x-axis. `lineX` selects a
 * time span across the full height; `removeOnClick` discards a stray click.
 */
export function getTimeBrushOption(theme: GrafanaTheme2): BrushOption {
  return {
    xAxisIndex: 0,
    brushType: 'lineX',
    brushMode: 'single',
    throttleType: 'debounce',
    throttleDelay: 80,
    removeOnClick: true,
    // No default toolbox brush buttons; the cursor is armed programmatically.
    toolbox: [],
    brushStyle: {
      color: theme.colors.action.selected,
      borderColor: theme.colors.border.strong,
      borderWidth: 1,
    },
  };
}

/** `takeGlobalCursor` payload that arms permanent time-span (lineX) brushing. */
export const ENABLE_TIME_BRUSH_ACTION = {
  type: 'takeGlobalCursor',
  key: 'brush',
  brushOption: { brushType: 'lineX', brushMode: 'single' },
};

/** `takeGlobalCursor` payload that exits brush mode (non-time axes). */
export const DISABLE_TIME_BRUSH_ACTION = {
  type: 'takeGlobalCursor',
  key: 'brush',
  brushOption: { brushType: false },
};

/** `brush` payload that clears any active selection highlight. */
export const CLEAR_TIME_BRUSH_ACTION = { type: 'brush', areas: [] };

function isFiniteNumberPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * The rendered x-axis a brush selection was made against. Only `type` and `data`
 * matter here: a `category` axis reports `coordRange` in category-index units
 * (not axis data values), so its ISO-timestamp labels are needed to translate
 * the selection back into epoch ms. Read from `chart.getOption()` in Panel.tsx.
 */
export interface BrushXAxisInfo {
  type?: string;
  data?: unknown[];
}

/** Constrain a (possibly out-of-range) category index to `[0, maxIndex]`. */
function clampIndex(index: number, maxIndex: number): number {
  return Math.min(Math.max(index, 0), maxIndex);
}

/** Epoch ms from a category label (ISO timestamp string), or `null` if unparseable. */
function categoryLabelToEpochMs(label: unknown): number | null {
  if (typeof label !== 'string') {
    return null;
  }
  const ms = Date.parse(label);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Translate a category-axis `coordRange` (category indices) into a time range via
 * the axis' ISO-timestamp labels. Candlestick/boxplot render on a `category` axis
 * (see charts/cartesian.ts), so ECharts reports the brushed span as `[fromIdx,
 * toIdx]` rather than `[fromMs, toMs]`. Indices are rounded/clamped to the data,
 * then mapped to the timestamps of the bounding categories.
 */
function categoryBrushToTimeRange(coordRange: [number, number], categories: unknown[] | undefined): AbsoluteTimeRange | null {
  if (!Array.isArray(categories) || categories.length === 0) {
    debug('Category brush without category labels', LOG_LEVELS.warn, { coordRange, categories });
    return null;
  }

  const maxIndex = categories.length - 1;
  const lowIndex = clampIndex(Math.round(Math.min(coordRange[0], coordRange[1])), maxIndex);
  const highIndex = clampIndex(Math.round(Math.max(coordRange[0], coordRange[1])), maxIndex);

  const from = categoryLabelToEpochMs(categories[lowIndex]);
  const to = categoryLabelToEpochMs(categories[highIndex]);
  if (from === null || to === null || from === to) {
    debug('Category brush could not resolve a time range', LOG_LEVELS.warn, { coordRange, lowIndex, highIndex });
    return null;
  }

  return { from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * Absolute time range (epoch ms) from an ECharts `brushEnd` event, or `null` for an empty / zero-width selection.
 * For a `lineX` brush on a `time` axis, `coordRange` is `[fromMs, toMs]` in axis data values.
 *
 * The candlestick/boxplot charts render on a `category` axis instead, where
 * `coordRange` is `[fromIdx, toIdx]` in category-index units; pass the rendered
 * `xAxis` so those indices can be mapped back to timestamps via the ISO labels.
 *
 * Note: The public ECharts types do not expose the BrushAreaParam in the public API, we're pulling it from the src instead of defining our own
 * They seem to have a bit of a blind-spot with the types in general with the brush types since the event handlers also do not expose
 * @todo open issue/PR in eCharts to properly expose the missing types and clean up the types here and in Panel.tsx
 */
export function brushEndToTimeRange(event: BrushEndEvent, xAxis?: BrushXAxisInfo): AbsoluteTimeRange | null {
  const coordRange = event?.areas?.[0]?.coordRange;
  if (!isFiniteNumberPair(coordRange)) {
    debug('Invalid coordinate range', LOG_LEVELS.warn, { coordRange, event });
    return null;
  }
  debug('Valid coordinate range', LOG_LEVELS.debug, { coordRange, axisType: xAxis?.type });

  if (xAxis?.type === 'category') {
    return categoryBrushToTimeRange(coordRange, xAxis.data);
  }

  const from = Math.round(Math.min(coordRange[0], coordRange[1]));
  const to = Math.round(Math.max(coordRange[0], coordRange[1]));
  return from === to ? null : { from, to };
}
