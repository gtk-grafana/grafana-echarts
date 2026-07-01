import {
  DataFrameType,
  FieldType,
  VisualizationSuggestion,
  VisualizationSuggestionScore,
  VisualizationSuggestionsSupplier,
} from '@grafana/data';
import { seriesTypePath } from 'editor/series';
import { EChartsFieldConfig } from 'editor/types';
import { PanelOptions } from 'types';

// Visualization Suggestions for the cartesian family (Groups 1-3): line/bar/
// scatter on a shared time/value grid. Scoring is keyed on the pre-computed
// PanelDataSummary rather than a flat series-type dropdown.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const cartesianSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  // Needs a time axis + at least one numeric value field and more than one
  // point to plot. Instant (snapshot) queries have a single time value and are
  // better served by the part-to-whole family, so skip them here.
  if (
    !dataSummary.hasFieldType(FieldType.time) ||
    !dataSummary.hasFieldType(FieldType.number) ||
    dataSummary.rowCountTotal < 2 ||
    dataSummary.isInstant
  ) {
    return;
  }

  // Rank higher when the data explicitly declares itself a time series (a
  // candlestick-shaped frame lands here too — it is structurally TimeSeriesWide).
  const score =
    dataSummary.hasDataFrameType(DataFrameType.TimeSeriesWide) ||
    dataSummary.hasDataFrameType(DataFrameType.TimeSeriesMulti) ||
    dataSummary.hasDataFrameType(DataFrameType.TimeSeriesLong)
      ? VisualizationSuggestionScore.Good
      : VisualizationSuggestionScore.OK;

  // Render type (line vs bar) is an in-family variant, surfaced as separate cards.
  const variants: Array<VisualizationSuggestion<PanelOptions, EChartsFieldConfig>> = [
    { name: 'Line', options: { [seriesTypePath]: 'line' } },
    { name: 'Bar', options: { [seriesTypePath]: 'bar' } },
  ];
  return variants.map((suggestion) => ({ score, ...suggestion }));
};
