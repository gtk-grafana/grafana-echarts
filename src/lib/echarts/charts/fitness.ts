import {
  type DataFrame,
  DataFrameType,
  type Field,
  FieldType,
  VisualizationSuggestionScore,
  type PanelDataSummary,
} from '@grafana/data';
import { heatmapFrameTypes } from 'editor/constants';
import { type MultiValueSeriesType } from 'editor/types';
import {
  ALL_VALUES_MAX_ROWS,
  CATEGORY_MAX_ROWS,
  HEATMAP_MATRIX_MAX_COLUMNS,
  HEATMAP_MATRIX_MAX_ROWS,
  MULTIVARIATE_MAX_AXES,
  MULTIVARIATE_MAX_SERIES,
  MULTIVARIATE_MIN_AXES,
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
  SLICE_MAX,
  SLICE_MIN,
  STREAM_MAX_LAYERS,
  STREAM_MIN_LAYERS,
} from 'lib/echarts/charts/suggestionLimits';
import { isFlameGraphFrame } from 'lib/echarts/converters/hierarchy';
import { resolveMultiValueSeriesType } from 'lib/echarts/converters/multiValueCartesian';
import { isEdgesFrame, isNodeGraphFrames, isNodesFrame } from 'lib/echarts/converters/nodeGraph';
import { isNumberField, isTimeField } from 'lib/grafana/narrowing';

/**
 * Per-family data fitness scoring over a Grafana `PanelDataSummary`.
 *
 * These functions are the single source of truth for "does this data suit family
 * X, and how strongly". Each nested panel's Visualization Suggestions supplier
 * (`modules/<family>/suggestions.ts`) turns a score into suggestion cards; the
 * numeric bounds they compare against live in `./suggestionLimits.ts`.
 *
 * **Not shared with the panel-level `'Auto'` resolver**, despite what this comment
 * claimed for a long time. `resolveAutoSeriesType` never calls anything here: it
 * keys off the panel's `ChartFamily` (which is fixed by the plugin's identity, so
 * there is nothing to score) and consults `resolveMultiValueSeriesType` for the
 * one genuinely ambiguous case. The two paths agree where it matters —
 * `resolveMultiValueSuggestion` below uses that same detector — but they are
 * separate decisions and only one of them is data-driven. Teaching Auto to pick
 * matrix-vs-binned / pie-vs-funnel / river-vs-bubble would be a separate change.
 *
 * Each `score*` returns the family's `VisualizationSuggestionScore`, or
 * `undefined` when the data does not fit that family at all. The `resolve*`
 * helpers return the extra shape a supplier needs to build a concrete card.
 *
 * ## Reading `summary.rawFrames`
 *
 * Several predicates inspect the frames directly, because `PanelDataSummary`
 * reports field *types* and dataplane frame types but not field *names* — and the
 * signals that identify node-graph, flame-graph and candlestick/boxplot data are
 * all name-based. Every such read is `summary.rawFrames ?? []` (the field is
 * optional) and touches only field metadata (`name`, `type`, `labels`) plus
 * `frame.length`, which is a property. Cost is O(fields), never O(rows), so
 * scoring stays effectively free; the *preview render* is the expensive part of a
 * suggestion, and `./suggestionCards.ts` is what bounds that.
 */

const isTimeSeriesFrame = (summary: PanelDataSummary): boolean =>
  summary.hasDataFrameType(DataFrameType.TimeSeriesWide) ||
  summary.hasDataFrameType(DataFrameType.TimeSeriesMulti) ||
  summary.hasDataFrameType(DataFrameType.TimeSeriesLong);

const isNumericFrame = (summary: PanelDataSummary): boolean =>
  summary.hasDataFrameType(DataFrameType.NumericWide) ||
  summary.hasDataFrameType(DataFrameType.NumericMulti) ||
  summary.hasDataFrameType(DataFrameType.NumericLong);

/**
 * True when the data carries no multi-point time dimension — the shape every "one
 * value per category" family needs (part-to-whole, hierarchy, multivariate).
 *
 * Deliberately not just `isInstant`. `PanelDataSummaryImpl` only ever assigns that
 * flag while walking a **time** field, so a frame with no time column at all — a
 * SQL/TestData category table, which is the canonical pie source — leaves it
 * `undefined` rather than `true`. The old `isNumericFrame || isInstant` gate read
 * that `undefined` as "not instant" and silently dropped exactly the data the
 * family exists for. Hence the explicit `=== true` and the third branch.
 */
const isSnapshotShape = (summary: PanelDataSummary): boolean =>
  isNumericFrame(summary) || summary.isInstant === true || !summary.hasFieldType(FieldType.time);

/** Frames from a summary, which types `rawFrames` as optional. */
const framesOf = (summary: PanelDataSummary): DataFrame[] => summary.rawFrames ?? [];

/**
 * Heatmap (binned): Grafana tagged the frame as a heatmap (rows or cells), or the
 * frames are a histogram-over-time in all but their `meta.type`.
 *
 * The second case is core Grafana's own heuristic, and it carries most of the weight
 * here because the shapes that produce it are common *and* untagged: a Prometheus
 * histogram (one `le`-labelled field per frame), a wide frame of bucket-named columns
 * (`1`, `2`, `4` — TestData's exponential bucket scenario), and a pivoted SQL
 * histogram of range-named columns (`0-10`, `10-20`). Provisioned TestData
 * `csv_content` cannot set frame metadata at all, so every fixture dashboard in this
 * repo depends on it.
 *
 * Note both branches tolerate **extra frames**: `hasDataFrameType` already asks "does
 * any frame carry this type", and {@link isBucketedTimeFrames} counts rather than
 * requires-all. That is what lets a heatmap-plus-overlay response score — see there.
 */
export const scoreHeatmap = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (summary.hasDataFrameType(DataFrameType.HeatmapRows) || summary.hasDataFrameType(DataFrameType.HeatmapCells)) {
    return VisualizationSuggestionScore.Best;
  }
  return isBucketedTimeFrames(framesOf(summary)) ? VisualizationSuggestionScore.Best : undefined;
};

/**
 * A bucket bound expressed as a *range* rather than a single edge — `0-10`,
 * `10-20`, `0.5..1.5`. Not a Prometheus convention, but it is what a pivoted SQL
 * histogram and this plugin's own `heatmap-overlay.json` fixture look like, and
 * `frameToBinnedHeatmap` renders such names as ordinal row labels
 * (`labelsAtBounds: false`). Accepts `-`, an en dash, or `..` as the separator, and
 * signed bounds on either side.
 */
const BUCKET_RANGE_NAME = /^-?\d+(?:\.\d+)?\s*(?:-|–|\.\.)\s*-?\d+(?:\.\d+)?$/;

/**
 * Whether a numeric field names a histogram bucket, by any of the conventions
 * `frameToBinnedHeatmap` can label a row from:
 *
 * - Prometheus' `le`/`ge` boundary label (the only one that yields true bounds)
 * - a name that *is* the bound: `0.1`, `1`, `512`, `+Inf`
 * - a name that is a bound *range*: `0-10` (see {@link BUCKET_RANGE_NAME})
 *
 * The range form matters: `Number('0-10')` is `NaN`, so a numeric-parse-only check
 * rejected the whole `heatmap-overlay.json` dashboard — including the panel with no
 * overlay at all.
 */
const isBucketField = (field: Field): boolean => {
  if (!isNumberField(field)) {
    return false;
  }
  if (field.labels?.le != null || field.labels?.ge != null) {
    return true;
  }
  const name = field.name.trim();
  if (name === '') {
    return false;
  }
  return name === '+Inf' || Number.isFinite(Number(name)) || BUCKET_RANGE_NAME.test(name);
};

/**
 * Whether these frames carry a histogram over time: **at least two bucket-named
 * numeric fields** on time-bearing frames.
 *
 * Counted across frames, so both accepted shapes match — a wide frame of bucket
 * columns, and a `TimeSeriesMulti` response of one `le`-labelled field per frame.
 *
 * Deliberately a **count, not an `every`**. This family's whole differentiator over
 * core's heatmap is that it draws cartesian *overlays* on top of the cells, and an
 * overlay arrives as an extra time frame of ordinary named series (`Trend`,
 * `Baseline`). Requiring every numeric field to be a bucket let a single overlay
 * field veto detection, so the exact panels built to show the feature off —
 * `heatmap-overlay.json`, and TestData's exponential bucket scenario plus an overlay
 * query — were the ones that never got a card. Non-bucket fields now simply do not
 * count toward the total.
 */
const isBucketedTimeFrames = (frames: DataFrame[]): boolean => {
  const bucketFields = frames
    .filter((frame) => frame.fields.some(isTimeField))
    .flatMap((frame) => frame.fields.filter(isBucketField));
  return bucketFields.length >= 2;
};

/**
 * Whether this frame contributes **cells** to the heatmap layer, as opposed to being
 * an overlay. Either Grafana tagged it, or it carries at least one bucket-named
 * numeric field.
 *
 * One bucket field is enough here, unlike {@link isBucketedTimeFrames}' total of two:
 * a Prometheus histogram arrives as one `le`-labelled field *per frame*, so a
 * per-frame floor of two would misread every one of those frames as an overlay. The
 * two-bucket minimum is a property of the response, not of each frame.
 */
const isHeatmapSourceFrame = (frame: DataFrame): boolean =>
  (frame.meta?.type != null && heatmapFrameTypes.includes(frame.meta.type)) || frame.fields.some(isBucketField);

/**
 * The query `refId`s whose frames should be drawn as cartesian **overlays** on the
 * heatmap cells rather than folded into them.
 *
 * `frameToBinnedHeatmap` merges every frame it is handed into one cell set, and
 * `splitFrames` only holds a frame back when one of its fields carries a cartesian
 * `seriesType` override — which is user field config, and does not exist yet when a
 * suggestion is built. So a heatmap-plus-overlay response previews with the overlay's
 * `Trend`/`Baseline` series turned into extra bucket rows, which is not what either
 * frame means. The heatmap supplier turns this list into `byFrameRefID` overrides so
 * the card (and the panel created from it) starts out configured the way
 * `heatmap-overlay.json` is configured by hand.
 *
 * A frame is an overlay when it is not a heatmap source (see
 * {@link isHeatmapSourceFrame}), it has a time field and a numeric field to draw, and
 * its `refId` is both present and not shared with any heatmap-source frame — a
 * `byFrameRefID` override applies to every field of every frame with that `refId`, so
 * a shared one would pull the cells out of the heatmap too. Frames that *are* bucketed
 * stay in the cell layer and merge, which is this family's documented multi-frame
 * behaviour (see `data-plane/heatmap-binned.md`).
 */
export const resolveHeatmapOverlayRefIds = (summary: PanelDataSummary): string[] => {
  const frames = framesOf(summary);
  const sourceRefIds = new Set(frames.filter(isHeatmapSourceFrame).map((frame) => frame.refId));
  const overlayRefIds = new Set<string>();

  for (const frame of frames) {
    const refId = frame.refId;
    if (isHeatmapSourceFrame(frame) || refId == null || refId === '' || sourceRefIds.has(refId)) {
      continue;
    }
    if (frame.fields.some(isTimeField) && frame.fields.some(isNumberField)) {
      overlayRefIds.add(refId);
    }
  }

  return [...overlayRefIds];
};

/**
 * Heatmap (matrix): a categorical grid — one string field for the Y (row)
 * categories and numeric fields as the X (column) categories, which is exactly
 * what `frameToMatrixHeatmap` reads. No time field, since a time dimension is the
 * binned layout's job.
 *
 * Both axes need at least two categories to be a grid rather than a strip: a
 * single numeric column over string rows is a bar chart, and the cartesian family
 * already suggests that.
 */
export const scoreMatrixHeatmap = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  const columns = summary.fieldCountByType(FieldType.number);
  const rows = summary.rowCountMax;
  if (
    summary.hasFieldType(FieldType.time) ||
    !summary.hasFieldType(FieldType.string) ||
    columns < 2 ||
    columns > HEATMAP_MATRIX_MAX_COLUMNS ||
    rows < 2 ||
    rows > HEATMAP_MATRIX_MAX_ROWS
  ) {
    return undefined;
  }
  return VisualizationSuggestionScore.Good;
};

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
 * Cartesian on a **category** x-axis: a string column of labels plus numeric
 * values, no time field. The shape a SQL `GROUP BY` returns, and the reason the
 * categorical bar chart existed for a long time without ever being suggested.
 *
 * Row-bounded by `CATEGORY_MAX_ROWS` (core barchart's own gate) because every row
 * becomes an axis label: past that the labels overlap into a grey band.
 */
export const scoreCategoryCartesian = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (
    summary.hasFieldType(FieldType.time) ||
    !summary.hasFieldType(FieldType.string) ||
    !summary.hasFieldType(FieldType.number) ||
    summary.rowCountMax < 2 ||
    summary.rowCountMax > CATEGORY_MAX_ROWS
  ) {
    return undefined;
  }
  return VisualizationSuggestionScore.Good;
};

/**
 * Cartesian scatter over two numeric axes: no time field, so the first numeric
 * field becomes the X axis — matching `resolveTimeField`'s numeric fallback, which
 * is what the converter actually does with such a frame.
 *
 * Deliberately not row-bounded like `scoreCategoryCartesian`: a scatter draws on a
 * *value* axis, where more points is the point. The preview cost is bounded by
 * `PREVIEW_MAX_ROWS` instead.
 */
export const scoreScatter = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (
    summary.hasFieldType(FieldType.time) ||
    summary.fieldCountByType(FieldType.number) < 2 ||
    summary.rowCountMax < 2
  ) {
    return undefined;
  }
  return VisualizationSuggestionScore.Good;
};

/**
 * A candlestick/boxplot suggestion when the frame's field *names* describe one:
 * OHLC (`open`/`high`/`low`/`close`) or a five-number summary
 * (`min`/`q1`/`median`/`q3`/`max`).
 *
 * Scored `Best` because the detection is a strong signal, not a guess — it reuses
 * `resolveMultiValueSeriesType`, the same strictly name-based detector
 * `resolveAutoSeriesType` routes on, which is what guarantees four arbitrary
 * numeric columns are never mistaken for a candlestick. Note it is deliberately
 * stricter than `resolveMultiValueFields`, whose boxplot path falls back to "the
 * first five numeric fields" at *render* time: a fallback is right once the user
 * has chosen the chart, and wrong when deciding whether to offer it.
 */
export interface MultiValueSuggestion {
  seriesType: MultiValueSeriesType;
  score: VisualizationSuggestionScore;
}

export const resolveMultiValueSuggestion = (summary: PanelDataSummary): MultiValueSuggestion | undefined => {
  const seriesType = resolveMultiValueSeriesType(framesOf(summary));
  return seriesType == null ? undefined : { seriesType, score: VisualizationSuggestionScore.Best };
};

/** How a part-to-whole family builds its slices, and how many there will be. */
export interface PartToWholeSlices {
  /**
   * `allValues` reads one slice per row of a single numeric field; `calculate`
   * reduces each numeric field to one slice. Maps directly onto
   * `reduceOptions.values`.
   */
  mode: 'allValues' | 'calculate';
  count: number;
}

/**
 * Resolve how many slices this data yields, and from what.
 *
 * A single numeric column has to be read **row per slice**: reducing one field
 * produces one value, i.e. a single 100% slice — a pie of nothing. So a lone
 * numeric field switches to all-values mode, provided the data is a snapshot shape
 * (a row per slice only makes sense when rows are *categories*, not timestamps) and
 * the row count is small enough to be a category list rather than a series
 * (`ALL_VALUES_MAX_ROWS`).
 *
 * Everything else reduces per field, which is Grafana's default and what
 * `getFieldDisplayValues` does with `values: false`. **That path deliberately has no
 * shape requirement**: `resolvePieSlices` documents Calculate as "each numeric field
 * across every frame becomes one slice, reduced by `reduceOptions.calcs[0]`", so the
 * reducer collapses the time dimension itself and the row count never reaches the
 * chart. A five-series Prometheus/TestData response reduced by `mean` is five slices
 * — the single most common pie in Grafana, and what
 * `provisioning/dashboards/part-to-whole/pie-parity.json` exists to compare against
 * core. Requiring a snapshot shape for it (as an earlier version of this file did)
 * withheld the family from exactly that dashboard.
 *
 * Always returns a shape; whether that shape is *worth suggesting* is
 * `scorePartToWhole`'s call.
 */
export const resolvePartToWholeSlices = (summary: PanelDataSummary): PartToWholeSlices => {
  const numericFields = summary.fieldCountByType(FieldType.number);
  const rows = summary.rowCountMax;
  if (numericFields === 1 && isSnapshotShape(summary) && rows >= SLICE_MIN && rows <= ALL_VALUES_MAX_ROWS) {
    return { mode: 'allValues', count: rows };
  }
  return { mode: 'calculate', count: numericFields };
};

/** Whether a frame is exactly one label column and one value column. */
const isCanonicalCategoryFrame = (summary: PanelDataSummary): boolean =>
  summary.fieldCount === 2 &&
  summary.fieldCountByType(FieldType.string) === 1 &&
  summary.fieldCountByType(FieldType.number) === 1;

/**
 * Part-to-whole (pie/donut/funnel): a slice count that actually shows a share of a
 * whole. **The gate is the slice count, not the frame shape** — see
 * {@link resolvePartToWholeSlices} for why Calculate mode makes a dense time series
 * a perfectly good pie, and note that the count is what a shape check would really
 * have been protecting: a lone numeric field that cannot be read row-per-slice
 * reduces to a single 100% slice and is withheld on `SLICE_MIN` anyway.
 *
 * Withheld outside `[SLICE_MIN, SLICE_MAX]`: one slice is always 100%, and past 30
 * the arcs are slivers — the same ceiling core piechart applies, and core is
 * observably silent at 500 series too. `Best` for the canonical
 * one-label-plus-one-value table, matching core piechart, which treats that shape as
 * its own.
 */
export const scorePartToWhole = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (!summary.hasData || !summary.hasFieldType(FieldType.number)) {
    return undefined;
  }
  const { count } = resolvePartToWholeSlices(summary);
  if (count < SLICE_MIN || count > SLICE_MAX) {
    return undefined;
  }
  return isCanonicalCategoryFrame(summary) ? VisualizationSuggestionScore.Best : VisualizationSuggestionScore.Good;
};

/**
 * Hierarchy (treemap/sunburst): a flame graph is the ideal fit and is detected
 * outright; otherwise the family reads a flat categorical shape, sharing
 * part-to-whole's slice bounds rather than restating them (which is what the
 * supplier used to do, in a copy that had already drifted).
 *
 * **It cannot share part-to-whole's shape tolerance, though.** This family has no
 * `reduceOptions`: `frameToHierarchy`'s flat path calls `frameToCategorical` and
 * emits one node per *row*, labelled by the string field or the row index. So where
 * a pie reduces a five-series time series to five slices, a treemap over the same
 * data would draw one node per timestamp named `"0"`, `"1"`, … — hence the explicit
 * `isSnapshotShape` gate here, which keeps a time dimension out.
 *
 * Both flame-graph signals are checked. `meta.preferredVisualisationType` is
 * Grafana's canonical one and the summary surfaces it directly; the nested-set
 * field shape (`isFlameGraphFrame`) is the fallback that lets provisioned TestData
 * CSV — which cannot set frame metadata — be recognised.
 */
export const scoreHierarchy = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (summary.hasPreferredVisualisationType('flamegraph') || framesOf(summary).some(isFlameGraphFrame)) {
    return VisualizationSuggestionScore.Best;
  }
  if (!isSnapshotShape(summary)) {
    return undefined;
  }
  return scorePartToWhole(summary);
};

/**
 * Multivariate (radar / parallel coordinates): several numeric metrics compared
 * across a bounded set of entities.
 *
 * The axes come from **rows**, not fields — `frameToCategorical` turns one row into
 * one indicator — which is why this is `rowCountMax` (a single frame is read) and
 * why the ceiling matters so much: the previous gate was `fieldCountByType(number)
 * >= 2` and nothing else, so a 500-series Prometheus response scored fit and
 * `radarToEChartsOption` was handed 500 axes. Requiring a snapshot shape now keeps
 * dense time series out on shape alone, and `MULTIVARIATE_MAX_AXES` bounds what
 * gets through.
 *
 * Numeric fields are the overlaid polygons/polylines. At least two, because one
 * polygon has nothing to be compared against — that is a bar chart.
 */
export const scoreMultivariate = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  if (!isSnapshotShape(summary)) {
    return undefined;
  }
  const axes = summary.rowCountMax;
  const series = summary.fieldCountByType(FieldType.number);
  if (axes < MULTIVARIATE_MIN_AXES || axes > MULTIVARIATE_MAX_AXES) {
    return undefined;
  }
  if (series < 2 || series > MULTIVARIATE_MAX_SERIES) {
    return undefined;
  }
  return VisualizationSuggestionScore.Good;
};

/**
 * Relations (graph / sankey / chord): node-graph data.
 *
 * This used to be a hard-coded `undefined`, on the documented grounds that
 * `PanelDataSummary` could not see either signal that identifies such data. That
 * is no longer true — the summary carries `hasPreferredVisualisationType` and
 * `rawFrames` — so the family is scored from the real signal instead of staying
 * permanently silent.
 *
 * `Best` for Grafana's own `nodeGraph` hint; `Good` for the `source`+`target` edge
 * shape (`isNodeGraphFrames`), which is what provisioned TestData CSV and SQL
 * Expression outputs look like, since neither can set frame metadata. Withheld
 * above `RELATIONS_MAX_EDGES`, where a force layout stops converging in a frame
 * budget.
 */
export const scoreRelations = (summary: PanelDataSummary): VisualizationSuggestionScore | undefined => {
  const frames = framesOf(summary);
  const isPreferred = summary.hasPreferredVisualisationType('nodeGraph');
  if (!isPreferred && !isNodeGraphFrames(frames)) {
    return undefined;
  }
  const edgesFrame = frames.find(isEdgesFrame);
  if (edgesFrame != null && edgesFrame.length > RELATIONS_MAX_EDGES) {
    return undefined;
  }
  return isPreferred ? VisualizationSuggestionScore.Best : VisualizationSuggestionScore.Good;
};

/**
 * Whether a chord ring would be too crowded to read, so the supplier can drop the
 * Chord card while keeping Graph and Sankey.
 *
 * A chord gives every node an arc on one circle, so it runs out of circumference
 * long before a force graph runs out of canvas. The count is approximated from
 * **frame lengths only**: the nodes frame's rows when Grafana sent one, else the
 * edges frame's, since each edge names at most two nodes and 40 ribbons is already
 * past the point where a ring separates. Counting distinct node ids would mean
 * iterating the `source`/`target` *values*, and every `rawFrames` read in this file
 * is deliberately O(fields).
 */
export const exceedsChordNodeBudget = (summary: PanelDataSummary): boolean => {
  const frames = framesOf(summary);
  const nodesFrame = frames.find(isNodesFrame);
  const countingFrame = nodesFrame ?? frames.find(isEdgesFrame);
  return countingFrame != null && countingFrame.length > RELATIONS_CHORD_MAX_NODES;
};

/**
 * Stream (theme river / bubble): the same time + numeric gate as cartesian — a
 * river is a time chart, and instant data has only one timestamp to stack at —
 * plus a layer count inside `[STREAM_MIN_LAYERS, STREAM_MAX_LAYERS]`. A
 * single-ribbon river is just a filled area chart that the cartesian family draws
 * better; past twenty, individual ribbons can no longer be followed.
 *
 * Layers come from either shape the family accepts (see `frameToStream`): one per
 * numeric field (so a wide frame's field count, or a `TimeSeriesMulti` response's
 * frame count), or one per value of a label column — whose cardinality the summary
 * cannot see, so the presence of a string field is taken as pivotable. The ceiling
 * can only be applied to the countable form, for the same reason.
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
  if (fieldLayers > STREAM_MAX_LAYERS) {
    return undefined;
  }
  const isPivotable = summary.hasFieldType(FieldType.string);
  return fieldLayers >= STREAM_MIN_LAYERS || isPivotable ? VisualizationSuggestionScore.OK : undefined;
};
