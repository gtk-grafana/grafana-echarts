import { type FieldConfigSource, FieldMatcherID, type VisualizationSuggestionsSupplier } from '@grafana/data';
import { seriesTypePath } from 'editor/constants';
import { type EChartsFieldConfig } from 'editor/types';
import { resolveHeatmapOverlayRefIds, scoreHeatmap, scoreMatrixHeatmap } from 'lib/echarts/charts/fitness';
import { previewCardOptions } from 'lib/echarts/charts/suggestionCards';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the heatmap family. This is where the old
// "a heatmap frame forces heatmap rendering" rule lives now: when Grafana tags a
// frame as HeatmapRows/HeatmapCells, this panel is the best fit — and so is an
// untagged histogram-over-time, which `scoreHeatmap` now recognises from its bucket
// field names (see charts/fitness.ts).
//
// The family's two coordinate models are mutually exclusive branches, since they
// need opposite data: `binned` draws interval cells on continuous axes and needs a
// time dimension, while `matrix` draws a category x category tile grid and needs a
// string column instead. Each branch emits at one score, so the family always
// renders as a single contiguous group in the suggestions pane.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support

/**
 * Field config marking each overlay `refId` as a line series, so a
 * heatmap-plus-overlay response renders as cells *plus lines* instead of folding the
 * overlay's series into the cell layer as extra bucket rows.
 *
 * `frameToBinnedHeatmap` merges every frame it is given, and `splitFrames` only holds
 * a frame back when a field carries a cartesian `seriesType` override — user field
 * config that does not exist yet at suggestion time. This supplies it. The matcher
 * and property are exactly what `provisioning/dashboards/heatmap-overlay.json` sets by
 * hand, so a suggested panel and a hand-built one agree.
 *
 * Deliberately on the suggestion's `fieldConfig` rather than in
 * `cardOptions.previewModifier`: the modifier runs on a throwaway clone, so a
 * preview-only fix would show the right chart on the card and then build the wrong one
 * when the user clicks it.
 */
const overlayFieldConfig = (refIds: string[]): FieldConfigSource<Partial<EChartsFieldConfig>> => ({
  defaults: {},
  overrides: refIds.map((refId) => ({
    matcher: { id: FieldMatcherID.byFrameRefID, options: refId },
    properties: [{ id: 'custom.seriesType', value: 'line' }],
  })),
});

export const heatmapSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  const cardOptions = previewCardOptions();

  const binnedScore = scoreHeatmap(dataSummary);
  if (binnedScore != null) {
    const overlayRefIds = resolveHeatmapOverlayRefIds(dataSummary);
    return [
      {
        name: 'Heatmap (binned)',
        score: binnedScore,
        options: { [seriesTypePath]: 'heatmap', heatmapLayout: 'binned' },
        ...(overlayRefIds.length > 0 ? { fieldConfig: overlayFieldConfig(overlayRefIds) } : {}),
        cardOptions,
      },
    ];
  }

  const matrixScore = scoreMatrixHeatmap(dataSummary);
  if (matrixScore != null) {
    return [
      {
        name: 'Heatmap (matrix)',
        score: matrixScore,
        options: { [seriesTypePath]: 'heatmap', heatmapLayout: 'matrix' },
        cardOptions,
      },
    ];
  }

  return;
};
