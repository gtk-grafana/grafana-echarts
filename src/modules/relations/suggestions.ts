import { type VisualizationSuggestionsSupplier } from '@grafana/data';
import { type EChartsFieldConfig } from 'editor/types';
import { scoreRelations } from 'lib/echarts/charts/fitness';
import { type PanelOptions } from 'types';

// Visualization Suggestions for the relations family (graph).
//
// This supplier never suggests. Node-graph data is identified by an
// `id`/`source`/`target` field shape or by `meta.preferredVisualisationType`, and
// `PanelDataSummary` exposes neither field names nor that meta signal — node/edge
// frames carry no dataplane `frame.meta.type` at all. Any proxy reachable from the
// summary (e.g. "two string fields and instant data") would match ordinary tables
// and suggest a panel that cannot render them, so silence is the better failure.
// The panel remains selectable manually, exactly like the hierarchy panel over a
// flame graph (see `modules/hierarchy/suggestions.ts`).
//
// The gate itself lives in `scoreRelations` so every family's fitness rule stays in
// one file; closing this needs `PanelDataSummary` extended upstream.
// https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/add-suggestions-support
export const relationsSuggestionsSupplier: VisualizationSuggestionsSupplier<PanelOptions, EChartsFieldConfig> = (
  dataSummary
) => {
  if (scoreRelations(dataSummary) == null) {
    return;
  }
  // Unreachable today; kept so the shape is correct if `scoreRelations` ever gains
  // a real signal.
  return [{ name: 'Graph', score: scoreRelations(dataSummary), options: { seriesType: 'graph' } }];
};
