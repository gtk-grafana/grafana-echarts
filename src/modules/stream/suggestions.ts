import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { streamChartTypePath } from 'editor/stream';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreStream } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { PREVIEW_MAX_ROWS } from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the stream family: time-series data stacked into
// 2-20 layers (numeric fields, one frame per series, or a label column to pivot
// on), drawn as a theme river or as a punch-card bubble timeline. The data gate is
// `scoreStream` (see charts/fitness.ts).
//
// Both variants are carried by the family-local `streamChartType`, not by
// `seriesType`: the bubble variant emits `scatter` series, and `scatter` is owned by
// the cartesian family in `resolveChartModule`, so `themeRiver` stays the family's
// routing token for both (see `editor/stream.ts`).
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const streamSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const score = scoreStream(dataSummary);
  if (score == null) {
    return;
  }

  // No label suppression override here: the layer-label switch already defaults to
  // off for every panel (`STREAM_SHOW_LABELS_DEFAULT`), so setting it in the preview
  // modifier would be a no-op, like `animation`.
  const cardOptions = previewCardOptions({ maxRows: PREVIEW_MAX_ROWS });

  // Both variants are offered for the same data, with no extra gate on the bubble.
  // It consumes the identical `StreamData` — `buildOption` reads the converter's
  // layers as "one row per layer" instead of "one ribbon per layer" — so whatever
  // gave the river its ribbons (numeric fields, one frame per series, or a pivoted
  // label column) names the punch card's rows just as well. Layer *count* is what
  // the bubble is sensitive to, since rows divide the panel height, and
  // `STREAM_MAX_LAYERS` already bounds that for the whole family.
  return [
    {
      name: 'Theme river',
      score,
      options: { [seriesTypePath]: 'themeRiver', [streamChartTypePath]: 'river' },
      cardOptions,
    },
    {
      name: 'Bubble',
      score,
      options: { [seriesTypePath]: 'themeRiver', [streamChartTypePath]: 'bubble' },
      cardOptions,
    },
  ];
};
