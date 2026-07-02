import type { GrafanaTheme2 } from '@grafana/data';
import type { ValueFormatter } from 'lib/echarts/style';

/** Built-in color gradients offered for the heatmap cell layer. */
export type HeatmapColorScheme = 'spectral' | 'blues' | 'turbo' | 'magma';

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
