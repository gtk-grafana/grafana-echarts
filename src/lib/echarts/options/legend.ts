import { type GrafanaTheme2 } from '@grafana/data';
import { defaultVizLegendOptions, LegendDisplayMode, type VizLegendOptions } from '@grafana/schema';
import { type LegendComponentOption } from 'echarts';
import { type ChartModule } from 'lib/echarts/charts/types';
import { getThemeTextStyle, LEGEND_FONT_SIZE } from 'lib/echarts/options/base';
import { type PanelOptions } from 'types';

// /** Subset of the ECharts `legend` option this plugin sets. */
// export interface EChartsLegendOption {
//   show: boolean;
//   type?: string;
//   icon?: string;
//   itemWidth?: number;
//   itemHeight?: number;
//   textStyle?: { color: string; fontFamily: string; fontSize: number };
//   orient?: 'horizontal' | 'vertical';
//   bottom?: number;
//   left?: string;
//   right?: number;
//   top?: string;
//   data?: string[];
// }

/** Baseline legend defaults shared by chart modules. */
export const DEFAULT_CHART_LEGEND: VizLegendOptions = {
  ...defaultVizLegendOptions,
  showLegend: true,
  displayMode: LegendDisplayMode.List,
  placement: 'bottom',
  calcs: [],
};

/**
 * Merge per-chart defaults with the user's panel legend options (user wins).
 */
export function resolveLegendOptions(module: ChartModule, options: PanelOptions): VizLegendOptions {
  return {
    ...module.legend,
    ...options.legend,
    calcs: options.legend?.calcs ?? module.legend.calcs,
  };
}

/**
 * Whether the legend should be rendered at all, mirroring Core Grafana: a
 * legend is hidden when `showLegend` is false, `isVisible` is false, or the
 * display mode is `hidden`.
 */
export function isLegendVisible(legend?: VizLegendOptions): boolean {
  if (!legend) {
    return false;
  }

  return legend.showLegend && legend.isVisible !== false;
}

/**
 * Whether the legend display mode is table (per-series calc columns).
 */
export function isTableLegend(legend?: VizLegendOptions): boolean {
  return isLegendVisible(legend) && legend?.displayMode === LegendDisplayMode.Table;
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
 * Note: ECharts' native legend only renders a list. List and table display modes
 * for cartesian/pie/radar are handled by Grafana's `VizLegend` DOM component
 * (see `components/Legend.tsx`); callers should suppress this native legend when
 * `domLegend` is true to avoid drawing two legends.
 */
export function getLegendOption(
  legend: VizLegendOptions | undefined,
  theme: GrafanaTheme2,
  names?: string[]
): LegendComponentOption {
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
      ...getThemeTextStyle(theme),
      fontSize: LEGEND_FONT_SIZE,
    },
    ...(names ? { data: names } : {}),
  };

  if (placement === 'right') {
    return { ...base, orient: 'vertical', right: 8, top: 'middle' };
  }

  return { ...base, orient: 'horizontal', bottom: 0, left: 'left' };
}

const LEGEND_GRID_PADDING = 12
const DEFAULT_GRID_PADDING = 8;

// @todo need more dynamic way of reserving width for axis labels, long values keep getting truncated!
export function getCartesianGrid(legend?: VizLegendOptions) {
  let right = legend?.placement === 'right' ? LEGEND_GRID_PADDING : 0;
  let bottom = legend?.placement === 'bottom' ? LEGEND_GRID_PADDING : 0;

  return { top: DEFAULT_GRID_PADDING, left: DEFAULT_GRID_PADDING, right, bottom, containLabel: true,  };
}
