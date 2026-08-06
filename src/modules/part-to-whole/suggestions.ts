import { type ReduceDataOptions, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { PIE_CALC_DEFAULT, pieLabelsPath, pieTypePath } from 'editor/pie';
import { type EChartsFieldConfig } from 'editor/types';
import { type PartToWholeSlices, resolvePartToWholeSlices, scorePartToWhole } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the part-to-whole family: one value per category,
// drawn as a pie, a donut or a funnel. The data gate is `scorePartToWhole` (see
// charts/fitness.ts), which also decides how the slices are built.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support

/**
 * The `reduceOptions` a slice mode implies, set explicitly on every card so the
 * created panel does not depend on editor defaults for a shape already resolved.
 *
 * `allValues` is Grafana's "All values" — one slice per row of the single numeric
 * field, which is the only readable way to draw a one-column table; `calculate`
 * reduces each numeric field to one slice with the family's default reducer. Both
 * feed `getFieldDisplayValues` in the pie slice resolver.
 */
const reduceOptionsFor = (slices: PartToWholeSlices): ReduceDataOptions =>
  slices.mode === 'allValues' ? { values: true, calcs: [] } : { values: false, calcs: [PIE_CALC_DEFAULT] };

export const partToWholeSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scorePartToWhole(dataSummary);
  if (score == null) {
    return;
  }

  const reduceOptions = reduceOptionsFor(resolvePartToWholeSlices(dataSummary));
  // Slice labels are the dominant layout cost in this family and are illegible at
  // card scale, so previews draw bare arcs. An explicit empty `displayLabels`
  // hides them — distinct from leaving it unset, which draws the slice name.
  const cardOptions = previewCardOptions({ options: { [pieLabelsPath]: [] } });

  // Donut is a `pieType` variant of the same render type, not a `seriesType` of
  // its own; funnel is the family's second render type.
  return [
    { name: 'Pie', score, options: { [seriesTypePath]: 'pie', reduceOptions }, cardOptions },
    { name: 'Donut', score, options: { [seriesTypePath]: 'pie', [pieTypePath]: 'donut', reduceOptions }, cardOptions },
    { name: 'Funnel', score, options: { [seriesTypePath]: 'funnel', reduceOptions }, cardOptions },
  ];
};
