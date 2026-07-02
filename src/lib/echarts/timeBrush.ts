import { type AbsoluteTimeRange, type GrafanaTheme2 } from '@grafana/data';

// Grafana-style drag-to-zoom for time-axis panels. A `lineX` brush lets the user
// drag a horizontal span over the time axis; on release we translate the
// selection into an absolute time range and hand it to Grafana (which refetches
// and re-renders the whole dashboard), rather than zooming ECharts locally.
// This mirrors how core panels drive the shared dashboard time range.
//
// The brush is driven programmatically via `takeGlobalCursor` (see the ENABLE
// action) instead of a toolbox, so no brush buttons are rendered.
// https://echarts.apache.org/en/option.html#brush

/**
 * ECharts `brush` config bound to the primary time x-axis. `lineX` selects a
 * time span across the full height; `removeOnClick` discards a stray click.
 */
export function getTimeBrushOption(theme: GrafanaTheme2) {
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

/** Shape of the `brushEnd` event we consume; only the first area's range matters. */
interface BrushEndEvent {
  areas?: Array<{ coordRange?: unknown }>;
}

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
 * Absolute time range (epoch ms) from an ECharts `brushEnd` event, or `null` for
 * an empty / zero-width selection. For a `lineX` brush on a `time` axis,
 * `coordRange` is `[fromMs, toMs]` in axis data values (already time-ordered by
 * ECharts, but we normalize defensively).
 */
export function brushEndToTimeRange(event: unknown): AbsoluteTimeRange | null {
  const coordRange = (event as BrushEndEvent)?.areas?.[0]?.coordRange;
  if (!isFiniteNumberPair(coordRange)) {
    return null;
  }

  const from = Math.round(Math.min(coordRange[0], coordRange[1]));
  const to = Math.round(Math.max(coordRange[0], coordRange[1]));
  return from === to ? null : { from, to };
}
