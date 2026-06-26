// COPIED FROM core Grafana (packages/grafana-ui/src/components/VizTooltip).
// These modern unified tooltip pieces are not yet exported from @grafana/ui.
// Replace this folder with the official export when available; the props/API are
// kept identical to ease that swap.
// @todo switch to the official @grafana/ui export once it lands.
//
// Only `getColorIndicatorClass` is copied here. Core's `getContentItems` /
// `getTooltipDisplayValue` / `calculateTooltipPosition` assume uPlot `Field`
// indices and pixel positions and are not needed: the ECharts bridge builds
// `VizTooltipItem[]` itself and lets ECharts position the tooltip.
import { type ColorIndicatorStyles } from './VizTooltipColorIndicator';
import { ColorIndicator } from './types';

export const getColorIndicatorClass = (colorIndicator: string, styles: ColorIndicatorStyles) => {
  switch (colorIndicator) {
    case ColorIndicator.series:
      return styles.series;
    case ColorIndicator.value:
      return styles.value;
    case ColorIndicator.hexagon:
      return styles.hexagon;
    case ColorIndicator.pie_1_4:
      return styles.pie_1_4;
    case ColorIndicator.pie_2_4:
      return styles.pie_2_4;
    case ColorIndicator.pie_3_4:
      return styles.pie_3_4;
    case ColorIndicator.marker_sm:
      return styles.marker_sm;
    case ColorIndicator.marker_md:
      return styles.marker_md;
    case ColorIndicator.marker_lg:
      return styles.marker_lg;
    default:
      return styles.value;
  }
};
