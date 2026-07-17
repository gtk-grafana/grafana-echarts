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

// Boolean adapters used by the resolver's precedence checks.
export const fitsHeatmap = (summary: PanelDataSummary): boolean => scoreHeatmap(summary) != null;
export const fitsCartesian = (summary: PanelDataSummary): boolean => scoreCartesian(summary) != null;
export const fitsPartToWhole = (summary: PanelDataSummary): boolean => scorePartToWhole(summary) != null;
export const fitsMultivariate = (summary: PanelDataSummary): boolean => scoreMultivariate(summary) != null;
