import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreMultivariate } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { MULTIVARIATE_PREVIEW_MAX_ROWS } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the multivariate family: several numeric metrics
// compared across a bounded set of entities, drawn as a radar (closed polygons on a
// polar grid) or as parallel coordinates (polylines across parallel axes). The data
// gate is `scoreMultivariate` (see charts/fitness.ts), which bounds the axis count —
// one *row* is one axis, so the unbounded gate this replaced is what let a
// 500-series response reach `radarToEChartsOption` and hang the tab.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const multivariateSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreMultivariate(dataSummary);
  if (score == null) {
    return;
  }

  // Grafana truncates each frame's field values to `maxRows`, so the preview draws
  // 25 indicators. Well under the 50 the gate allows: 50 axis labels around a 350px
  // card are a grey smear, while 25 still reads as the right shape.
  const cardOptions = previewCardOptions({ maxRows: MULTIVARIATE_PREVIEW_MAX_ROWS });

  return [
    { name: 'Radar', score, options: { [seriesTypePath]: 'radar' }, cardOptions },
    { name: 'Parallel', score, options: { [seriesTypePath]: 'parallel' }, cardOptions },
  ];
};
