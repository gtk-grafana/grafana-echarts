import { type DisplayProcessor, formattedValueToString, type GrafanaTheme2 } from '@grafana/data';
import { type ContinuousVisualMapOption } from 'echarts/types/dist/shared';
import { getThemeTextStyle } from 'lib/echarts/options/base';
import { getHeatmapColors } from 'lib/echarts/options/constants';
import { type HeatmapColorScalePlacement, type HeatmapColorScheme } from 'lib/echarts/options/types';

/** Bar thickness (px), shared by both orientations (ECharts `itemWidth`). */
const VISUALMAP_ITEM_THICKNESS = 12;
/** Bar length (px) along the gradient; ECharts uses `itemHeight` in both orientations. */
const VISUALMAP_ITEM_LENGTH = 120;
const VISUALMAP_RIGHT_INSET = 0;
const VISUALMAP_BOTTOM_INSET = 0;

/** Inputs for the shared heatmap color scale, decoupled from the binned/matrix data shapes. */
export interface HeatmapVisualMapParams {
  valueMin: number;
  valueMax: number;
  /** Encoded-tuple dimension holding the cell value (binned and matrix differ). */
  dimension: number;
  theme: GrafanaTheme2;
  seriesIndex: number;
  scheme?: HeatmapColorScheme;
  placement?: HeatmapColorScalePlacement;
  formatDisplayValue: DisplayProcessor;
}

/**
 * Continuous visualMap (the heatmap color scale) shared by the binned and matrix
 * layouts. Placed on the right (vertical) or bottom (horizontal) per `placement`,
 * inset from the panel edge and kept thin so it sits within the grid margin the
 * heatmap reserves (see `getHeatmapGrid`) instead of overlapping the cells, axis,
 * or legend. `hoverLink` highlights the cells in a hovered value range.
 *
 * ECharts' `itemHeight` is the bar length and `itemWidth` its thickness in BOTH
 * orientations, so the same sizes apply to horizontal and vertical.
 * See https://echarts.apache.org/en/option.html#visualMap-continuous
 */
export function getHeatmapVisualMap({
  valueMin,
  valueMax,
  dimension,
  theme,
  seriesIndex,
  scheme,
  placement = 'right',
  formatDisplayValue,
}: HeatmapVisualMapParams): ContinuousVisualMapOption {
  // Position/size the bar per placement. ECharts positions accept a number (px)
  // or a percent/keyword string, so plain px numbers are used here.
  const orientation: Pick<
    ContinuousVisualMapOption,
    'orient' | 'left' | 'right' | 'top' | 'bottom' | 'itemWidth' | 'itemHeight'
  > =
    placement === 'bottom'
      ? {
          orient: 'horizontal',
          bottom: VISUALMAP_BOTTOM_INSET,
          left: 'center',
          itemWidth: VISUALMAP_ITEM_THICKNESS,
          itemHeight: VISUALMAP_ITEM_LENGTH,
        }
      : {
          orient: 'vertical',
          right: VISUALMAP_RIGHT_INSET,
          top: 'middle',
          itemWidth: VISUALMAP_ITEM_THICKNESS,
          itemHeight: VISUALMAP_ITEM_LENGTH,
        };

  return {
    type: 'continuous',
    // `none` hides the color scale legend but still maps cell values to colors,
    // so the heatmap stays colored without the scale taking up panel space.
    // https://echarts.apache.org/en/option.html#visualMap-continuous.show
    show: placement !== 'none',
    min: valueMin,
    // Widen a degenerate single-value range so the scale still renders.
    max: valueMax === valueMin ? valueMin + 1 : valueMax,
    dimension,
    seriesIndex,
    calculable: true,
    hoverLink: true,
    ...orientation,
    formatter: (value) => formattedValueToString(formatDisplayValue(Number(value))),
    inRange: { color: getHeatmapColors(scheme) },
    textStyle: getThemeTextStyle(theme),
  };
}
