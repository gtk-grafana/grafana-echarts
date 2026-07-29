import {
  DataFrameType,
  FieldType,
  VisualizationSuggestionScore,
  type VisualizationSuggestionsSupplier,
} from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the hierarchy family (treemap/sunburst).
//
// Flame-graph nested-set frames are the ideal fit, but they are identified via
// `meta.preferredVisualisationType`, which `PanelDataSummary` does not expose;
// so auto-suggestion here only covers the flat categorical path (one value per
// category), like part-to-whole. Flame-graph data still renders when the panel
// is selected manually (see echarts/converters/hierarchy.ts).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const hierarchySuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  // Needs at least one numeric value to size the nodes.
  if (!dataSummary.hasFieldType(FieldType.number)) {
    return;
  }

  const isNumericFrame =
    dataSummary.hasDataFrameType(DataFrameType.NumericWide) ||
    dataSummary.hasDataFrameType(DataFrameType.NumericMulti) ||
    dataSummary.hasDataFrameType(DataFrameType.NumericLong);

  // A single value per category (or otherwise instant/snapshot data) is the
  // renderable shape; multi-point time series are not.
  if (!isNumericFrame && !dataSummary.isInstant) {
    return;
  }

  const score = isNumericFrame ? VisualizationSuggestionScore.Good : VisualizationSuggestionScore.OK;
  return [
    { name: 'Treemap', score, options: { [seriesTypePath]: 'treemap' } },
    { name: 'Sunburst', score, options: { [seriesTypePath]: 'sunburst' } },
  ];
};
