import { GrafanaTheme2 } from '@grafana/data';
import { LegendDisplayMode, VizLegendOptions } from '@grafana/schema';

/** Matches Core Grafana's legend text size. */
const LEGEND_FONT_SIZE = 12;

/** Subset of the ECharts `legend` option this plugin sets. */
export interface EChartsLegendOption {
  show: boolean;
  type?: string;
  icon?: string;
  itemWidth?: number;
  itemHeight?: number;
  textStyle?: { color: string; fontFamily: string; fontSize: number };
  orient?: 'horizontal' | 'vertical';
  bottom?: number;
  left?: string;
  right?: number;
  top?: string;
  data?: string[];
}

/**
 * Whether the legend should be rendered at all, mirroring Core Grafana: a
 * legend is hidden when `showLegend` is false or the display mode is `hidden`.
 */
export function isLegendVisible(legend?: VizLegendOptions): boolean {
  if (!legend) {
    return false;
  }

  return legend.showLegend !== false && legend.displayMode !== LegendDisplayMode.Hidden;
}

/**
 * Build the ECharts `legend` config from Core Grafana's `VizLegendOptions`,
 * styled to match Grafana (theme text color/font) and positioned per the
 * `placement` option.
 *
 * `names` lets callers (pie/radar) pass the item names explicitly, since those
 * charts carry a single series whose `data[].name` entries are the legend items
 * rather than one series per name (the cartesian case ECharts derives on its own).
 *
 * Note: ECharts' native legend renders as a list. The `table` display mode and
 * per-series `calcs` values are not represented (they fall back to the list);
 * full table parity would require a custom DOM legend.
 */
export function getLegendOption(
  legend: VizLegendOptions | undefined,
  theme: GrafanaTheme2,
  names?: string[]
): EChartsLegendOption {
  if (!isLegendVisible(legend)) {
    return { show: false };
  }

  const placement = legend?.placement ?? 'bottom';

  const base = {
    show: true,
    type: 'scroll',
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 12,
    textStyle: {
      color: theme.colors.text.primary,
      fontFamily: theme.typography.fontFamily,
      fontSize: LEGEND_FONT_SIZE,
    },
    ...(names ? { data: names } : {}),
  };

  if (placement === 'right') {
    return { ...base, orient: 'vertical', right: 8, top: 'middle' };
  }

  return { ...base, orient: 'horizontal', bottom: 0, left: 'center' };
}

/**
 * Grid insets for cartesian charts that reserve room for the legend so it does
 * not overlap the plot. `containLabel` keeps axis labels inside the grid.
 */
export function getCartesianGrid(legend?: VizLegendOptions) {
  const grid = { top: 16, left: 8, right: 16, bottom: 24, containLabel: true };

  if (!isLegendVisible(legend)) {
    return grid;
  }

  if ((legend?.placement ?? 'bottom') === 'right') {
    const width = legend?.width;
    return { ...grid, right: width && width > 0 ? width + 24 : 120 };
  }

  return { ...grid, bottom: 48 };
}
