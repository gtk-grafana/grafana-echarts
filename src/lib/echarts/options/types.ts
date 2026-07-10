import type { GrafanaTheme2, ValueFormatter } from '@grafana/data';

/** Built-in color gradients offered for the heatmap cell layer. */
export type HeatmapColorScheme = 'spectral' | 'blues' | 'turbo' | 'magma';

/**
 * Where the heatmap color scale (the ECharts `visualMap` legend) is rendered
 * relative to the cell grid.
 */
export type HeatmapColorScalePlacement = 'right' | 'bottom';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Theme + formatting context the heatmap tooltip needs to match Grafana. */
export interface HeatmapTooltipContext {
  theme: GrafanaTheme2;
  timeZone: string;
  formatValue: ValueFormatter;
}
