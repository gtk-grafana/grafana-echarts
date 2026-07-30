import { DataFrameType, FieldType, VisualizationSuggestionScore, type PanelDataSummary } from '@grafana/data';

/**
 * Per-family data fitness scoring over a Grafana `PanelDataSummary`.
 *
 * These functions are the single source of truth for "does this data suit
 * family X, and how strongly". They are shared by each nested panel's
 * Visualization Suggestions supplier (which turns the score into a suggestion
 * card) and by the panel-level `'Auto'` resolver (`resolveAutoSeriesType`, which
 * picks the best-fitting family for a freshly added panel). Keeping the gates in
 * one place means a suggestion and the auto-pick can never drift apart.
 *
 * Each `score*` returns the family's `VisualizationSuggestionScore`, or
 * `undefined` when the data does not fit that family at all.
 */

const isTimeSeriesFrame = (summary: PanelDataSummary): boolean =>
  summary.hasDataFrameType(DataFrameType.TimeSeriesWide) ||
  summary.hasDataFrameType(DataFrameType.TimeSeriesMulti) ||
  summary.hasDataFrameType(DataFrameType.TimeSeriesLong);

const isNumericFrame = (summary: PanelDataSummary): boolean =>
  summary.hasDataFrameType(DataFrameType.NumericWide) ||
  summary.hasDataFrameType(DataFrameType.NumericMulti) ||
  summary.hasDataFrameType(DataFrameType.NumericLong);

/** Heatmap: Grafana tagged the frame as a heatmap (rows or cells). */
export const scoreHeatmap = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined =>
  summary.hasDataFrameType(DataFrameType.HeatmapRows) || summary.hasDataFrameType(DataFrameType.HeatmapCells)
    ? VisualizationSuggestionScore.Best
    : undefined;

/**
 * Cartesian (line/bar): needs a time axis, at least one numeric value field and
 * more than one point to plot. Instant (snapshot) data has a single time value
 * and is better served by the part-to-whole family, so it is excluded here.
 */
export const scoreCartesian = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (
    !summary.hasFieldType(FieldType.time) ||
    !summary.hasFieldType(FieldType.number) ||
    summary.rowCountTotal < 2 ||
    summary.isInstant
  ) {
    return undefined;
  }
  return isTimeSeriesFrame(summary) ? VisualizationSuggestionScore.Good : VisualizationSuggestionScore.OK;
};

/**
 * Part-to-whole (pie): reads a single value per category, so it only suits
 * numeric frames or otherwise instant (snapshot) data — not multi-point time
 * series.
 */
export const scorePartToWhole = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (!summary.hasFieldType(FieldType.number)) {
    return undefined;
  }
  if (!isNumericFrame(summary) && !summary.isInstant) {
    return undefined;
  }
  return isNumericFrame(summary) ? VisualizationSuggestionScore.Good : VisualizationSuggestionScore.OK;
};

/** Multivariate (radar): several numeric metrics to place around the axes. */
export const scoreMultivariate = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined =>
  summary.fieldCountByType(FieldType.number) >= 2 ? VisualizationSuggestionScore.OK : undefined;

/**
 * Relations (graph): **never suggested — always `undefined`.**
 *
 * Node-graph data is identified by an `id`/`source`/`target` field shape (see
 * `isNodeGraphFrames`) or by `meta.preferredVisualisationType`, and
 * `PanelDataSummary` exposes neither: it reports field *types* and dataplane frame
 * types, not field names, and node/edge frames carry no `frame.meta.type` at all.
 * The same wall blocks hierarchy's flame-graph path (see
 * `modules/hierarchy/suggestions.ts`).
 *
 * Scoring on a reachable proxy — "two or more string fields and instant data" —
 * would match any ordinary table, so the panel would be suggested for data it
 * cannot render. Staying silent is the better failure: the panel is still
 * selectable manually, exactly like hierarchy over a flame graph. Closing this
 * properly needs `PanelDataSummary` extended upstream to surface
 * `preferredVisualisationType` (or field names).
 *
 * Kept as a function, rather than omitted, so every family still has one entry
 * point here and the reasoning lives with its siblings.
 */
export const scoreRelations = (_summary: PanelDataSummary): VisualizationSuggestionScore | undefined => undefined;

/**
 * Stream (theme river): the same time + numeric gate as cartesian — a river is a
 * time chart, and instant data has only one timestamp to stack at — plus a
 * requirement for **more than one layer**, since a single-ribbon river is just a
 * filled area chart that the cartesian family draws better.
 *
 * Layers come from either shape the family accepts (see `frameToStream`): one per
 * numeric field (so a wide frame's field count, or a `TimeSeriesMulti` response's
 * frame count), or one per value of a label column — whose cardinality the summary
 * cannot see, so the presence of a string field is taken as pivotable.
 *
 * Caps at `OK`, deliberately. A stream graph trades a readable value axis for
 * composition-over-time, so it is the "there are likely better options" case that
 * score documents rather than a rival to the cartesian suggestion.
 */
export const scoreStream = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (
    !summary.hasFieldType(FieldType.time) ||
    !summary.hasFieldType(FieldType.number) ||
    summary.rowCountTotal < 2 ||
    summary.isInstant
  ) {
    return undefined;
  }
  const fieldLayers = Math.max(summary.frameCount, summary.fieldCountByType(FieldType.number));
  const isPivotable = summary.hasFieldType(FieldType.string);
  return fieldLayers > 1 || isPivotable ? VisualizationSuggestionScore.OK : undefined;
};
