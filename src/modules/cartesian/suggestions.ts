import { type VisualizationSuggestion, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsGraphFieldConfig } from 'editor/types';
import {
  resolveMultiValueSuggestion,
  scoreCartesian,
  scoreCategoryCartesian,
  scoreScatter,
} from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { PREVIEW_MAX_ROWS } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the cartesian family (Groups 1-3): line, bar,
// scatter, candlestick and box plot on a shared x/value grid. The data gates live
// in charts/fitness.ts.
//
// The branches below are **mutually exclusive, and each emits every card at one
// score.** Grafana sorts the flat suggestion list by score and the UI groups
// *contiguous* runs of the same `pluginId`, so a family that emitted cards at two
// different scores could have another family's cards land between them and would
// render as two separate groups. That is why an OHLC frame returns only the
// Candlestick card and not Candlestick + Line + Bar — which is also the correct
// read, since `resolveAutoSeriesType` already routes such a frame to candlestick,
// so offering Line here would contradict the panel's own Auto behaviour.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const cartesianSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsGraphFieldConfig> = (
  dataSummary
) => {
  const cardOptions = previewCardOptions({ maxRows: PREVIEW_MAX_ROWS });
  const card = (
    suggestion: VisualizationSuggestion<PanelOptions, EChartsGraphFieldConfig>
  ): VisualizationSuggestion<PanelOptions, EChartsGraphFieldConfig> => ({ cardOptions, ...suggestion });

  // Multi-value first: the field names are a strong, unambiguous signal, and the
  // frame draws as one series rather than as a line per column.
  const multiValue = resolveMultiValueSuggestion(dataSummary);
  if (multiValue) {
    const { seriesType, score } = multiValue;
    const name = seriesType === 'candlestick' ? 'Candlestick' : 'Box plot';
    return [card({ name, score, options: { [seriesTypePath]: seriesType } })];
  }

  const timeScore = scoreCartesian(dataSummary);
  if (timeScore != null) {
    return [
      card({ name: 'Line', score: timeScore, options: { [seriesTypePath]: 'line' } }),
      card({ name: 'Bar', score: timeScore, options: { [seriesTypePath]: 'bar' } }),
    ];
  }

  // No time field: a string column of labels makes this a category-axis chart.
  const categoryScore = scoreCategoryCartesian(dataSummary);
  if (categoryScore != null) {
    return [
      card({ name: 'Bar', score: categoryScore, options: { [seriesTypePath]: 'bar' } }),
      card({ name: 'Bar stacked', score: categoryScore, options: { [seriesTypePath]: 'bar', stackSeries: true } }),
      card({ name: 'Scatter', score: categoryScore, options: { [seriesTypePath]: 'scatter' } }),
    ];
  }

  // Numeric columns with no labels at all: the first becomes the x axis, matching
  // `resolveTimeField`'s numeric fallback.
  const scatterScore = scoreScatter(dataSummary);
  if (scatterScore != null) {
    return [card({ name: 'Scatter', score: scatterScore, options: { [seriesTypePath]: 'scatter' } })];
  }

  return;
};
