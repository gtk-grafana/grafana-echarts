import { TooltipDisplayMode } from '@grafana/schema';
import { EChartsTooltipTrigger, TooltipKind } from './types';

/** Crosshair line color from Core Grafana's uPlot panels. */
const CROSSHAIR_COLOR = 'rgba(120, 120, 130, 0.5)';

/**
 * Pick the ECharts tooltip trigger for the active series kind and tooltip mode.
 */
export function tooltipTriggerForMode(kind: TooltipKind, mode: TooltipDisplayMode): EChartsTooltipTrigger {
  if (kind === 'timeseries') {
    return mode === TooltipDisplayMode.Single ? 'item' : 'axis';
  }
  return 'item';
}

/** ECharts axisPointer styled to match Core Grafana's uPlot cursor crosshair. */
export function getCrosshairAxisPointer() {
  const lineStyle = { color: CROSSHAIR_COLOR, width: 1, type: 'dashed' as const };
  return {
    show: true,
    type: 'cross' as const,
    lineStyle,
    crossStyle: lineStyle,
    label: { show: false },
  };
}

/**
 * Static ECharts tooltip config: transparent box; Grafana React tooltip renders content.
 */
export function getTooltipOption(trigger: EChartsTooltipTrigger, mode?: TooltipDisplayMode) {
  if (mode === TooltipDisplayMode.None) {
    return { show: false };
  }

  return {
    show: true,
    trigger,
    appendToBody: false,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    extraCssText: 'box-shadow: none;',
    axisPointer: getCrosshairAxisPointer(),
  };
}
