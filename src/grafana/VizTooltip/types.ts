// COPIED FROM core Grafana (packages/grafana-ui/src/components/VizTooltip).
// These modern unified tooltip pieces are not yet exported from @grafana/ui.
// Replace this folder with the official export when available; the props/API are
// kept identical to ease that swap.
// @todo switch to the official @grafana/ui export once it lands.
import { type LineStyle } from '@grafana/schema';

export enum ColorIndicator {
  series = 'series',
  value = 'value',
  hexagon = 'hexagon',
  pie_1_4 = 'pie_1_4',
  pie_2_4 = 'pie_2_4',
  pie_3_4 = 'pie_3_4',
  marker_sm = 'marker_sm',
  marker_md = 'marker_md',
  marker_lg = 'marker_lg',
}

export enum ColorPlacement {
  hidden = 'hidden',
  first = 'first',
  leading = 'leading',
  trailing = 'trailing',
}

export interface VizTooltipItem {
  label: string;
  value: string;
  color?: string;
  colorIndicator?: ColorIndicator;
  colorPlacement?: ColorPlacement;
  isActive?: boolean;
  lineStyle?: LineStyle;
  isHiddenFromViz?: boolean;

  // internal/tmp for sorting
  numeric?: number;
}

export const DEFAULT_COLOR_INDICATOR = ColorIndicator.series;
