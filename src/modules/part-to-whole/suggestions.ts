import {
  DataFrameType,
  FieldType,
  VisualizationSuggestionScore,
  type VisualizationSuggestionsSupplier,
} from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the part-to-whole family: pie built
// from one value per category. Numeric (instant) frames are the natural fit.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const partToWholeSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  // Needs at least one numeric value to size the slices.
  if (!dataSummary.hasFieldType(FieldType.number)) {
    return;
  }

  const isNumericFrame =
    dataSummary.hasDataFrameType(DataFrameType.NumericWide) ||
    dataSummary.hasDataFrameType(DataFrameType.NumericMulti) ||
    dataSummary.hasDataFrameType(DataFrameType.NumericLong);

  // Part-to-whole reads a single value per category, so it only suits numeric
  // frames or otherwise instant (snapshot) data — not multi-point time series.
  if (!isNumericFrame && !dataSummary.isInstant) {
    return;
  }

  return [{ score: isNumericFrame ? VisualizationSuggestionScore.Good : VisualizationSuggestionScore.OK }];
};
