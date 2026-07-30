# Binned heatmap

The binned heatmap is the plugin's rendering of Grafana's native **Heatmap**
data plane kind: cells with explicit bounds drawn against a continuous x-axis
(time or numeric) and a bucketed y-axis.

- Converter: `frameToBinnedHeatmap` — `src/lib/echarts/converters/binnedHeatmap.ts`
- Chart family: the composite **Heatmap** panel (`seriesType === 'heatmap'`)
- Suggested automatically when Grafana tags a frame `HeatmapRows` / `HeatmapCells`,
  and for an untagged **histogram over time** — see
  [Suggestions](#suggestions) below.

## Grafana data plane equivalent

This model consumes the **Heatmap** kind. See
https://grafana.com/developers/dataplane/heatmap. A frame is treated as a
heatmap when its `meta.type` is `heatmap-rows` or `heatmap-cells`
(`heatmapFrameTypes` in `src/editor/constants.ts`, checked by
`isBinnedHeatmapFrame`). A plain `TimeSeriesWide` frame is also accepted and
read as heatmap-rows, per the spec note that "Timeseries wide can be used
directly as heatmap-rows".

Because the native ECharts heatmap series requires two _category_ axes, the
plugin does not use it here. Instead it derives explicit half-open cell
rectangles `[xStart, xEnd) x [yStart, yEnd)` in data space and renders them with
a custom series, which preserves a continuous `time` (or `value`) x-axis.

## HeatmapRows

`rowsToCells` maps a rows frame:

- The **first field is the X axis**, taken _positionally_ (not by type) to match
  core Grafana (`heatmap.fields[0]`). Per the spec the X field may be `time`
  **or** `number`; `xIsTime` records which so the caller picks a `time` vs
  `value` axis.
- Every **remaining numeric field is a bucket row**.
- A row's upper bound is its `le` label (Prometheus histogram convention); the
  lower bound is the previous row's upper bound. Rows are sorted by numeric `le`
  so stacked bounds stay contiguous.
- With **no `le` labels** (e.g. a wide time series reused as rows), rows fall
  back to unit-height buckets in field order, labelled by field display name.
- X cells span `[x, x + step)`, where `step` is the smallest positive gap
  between X values (the last column reuses the prior step).

An open-ended `+Inf` top bucket reuses the previous bucket's height so it stays
visible rather than spanning to infinity.

## HeatmapCells

`cellsToCells` maps a cells frame (one row per cell):

- **X bounds** come from `xMin`/`xMax` when present (sparse layout), otherwise
  from the center `x` field (or first time field) ± half the inferred step.
- **Y bounds** come from `yMin`/`yMax`, otherwise from the center `y` field ±
  half its step.
- The **value** is the first numeric field that is not an axis-bound field
  (`x`/`xMin`/`xMax`/`y`/`yMin`/`yMax` and not the resolved center fields).

This matches the spec's sparse-heatmap rule: when both min and max exist for a
dimension, cells need not be uniformly distributed.

## Multiple frames

`frameToBinnedHeatmap` merges every heatmap frame into one cell set. The x-axis
is treated as time **only when every contributing frame** uses a time X field; a
single numeric-X frame drops the whole layer to a value axis. Bucket labels sit
at their bounds unless every frame is ordinal (field-name rows), in which case
they are centered (`yLabelPlacement`).

## Suggestions

`scoreHeatmap` (`src/lib/echarts/charts/fitness.ts`) scores `Best` on either signal:

1. **Grafana tagged it** — any frame with `meta.type` of `heatmap-rows` /
   `heatmap-cells`.
2. **It is a histogram over time in all but its `meta.type`** — at least two
   _bucket-named_ numeric fields on time-bearing frames. A field counts as
   bucket-named when it carries Prometheus' `le`/`ge` label, when its name **is** the
   bound (`0.1`, `1`, `512`, `+Inf`), or when its name is a bound **range** (`0-10`,
   `0.5..1.5`). Two buckets minimum; one is a plain time series.

The second signal carries most of the weight, because provisioned TestData
`csv_content` cannot set frame metadata at all — so every heatmap fixture dashboard
in this repo depends on it, as does TestData's exponential bucket scenario (a single
wide frame of `1`, `2`, `4`, … columns and no `meta`).

**Both signals tolerate extra frames, deliberately.** This family's differentiator
over core's heatmap is that it draws cartesian _overlays_ on the cells (line/bar/
scatter series selected per field, see `getOverlayFrames` in
`src/lib/echarts/charts/binnedHeatmap.ts`), and an overlay arrives as an extra time
frame of ordinary named series (`Trend`, `Baseline`). `hasDataFrameType` already asks "does _any_ frame carry this type", and
the bucket signal **counts** matching fields rather than requiring all of them to
match — an earlier version required every numeric field to be a bucket, which let a
single overlay field veto the card and left `heatmap-overlay.json` with no suggestion
at any of its panels.

### The suggestion configures the overlay itself

Scoring the card is not sufficient on its own. `frameToBinnedHeatmap` merges **every**
frame it is handed into one cell set, and `splitFrames` only holds a frame back when one
of its fields carries a cartesian `seriesType` override — which is user field config,
and does not exist yet when a suggestion is built. So a heatmap-plus-overlay response
previewed with the overlay's `Trend`/`Baseline` series turned into two extra bucket
rows: both frames in the cells, which is what neither frame means.

`resolveHeatmapOverlayRefIds` (`src/lib/echarts/charts/fitness.ts`) therefore splits the
frames, and the supplier emits one `byFrameRefID` → `custom.seriesType: 'line'` override
per overlay `refId` — byte-identical to what `heatmap-overlay.json` sets by hand, so a
suggested panel and a hand-built one agree. A frame is an overlay when it is **not** a
cell source (not tagged, no bucket-named field), it has a time field and a numeric field
to draw, and its `refId` is present and not shared with any cell-source frame. That last
condition matters because a `byFrameRefID` override applies to every field of every
frame under that `refId`, so overlaying a shared one would pull the cells out of the
heatmap too; in that case no override is emitted and the frames merge as before.

Bucketed frames are never treated as overlays — several histogram queries merge into one
cell set, which is this family's documented [multi-frame](#multiple-frames) behaviour.

The override lives on the suggestion's `fieldConfig`, not in
`cardOptions.previewModifier`. The modifier runs against a `cloneDeep` of the suggestion,
so a preview-only fix would show the right chart on the card and then build the wrong one
when the user clicked it. Grafana passes `fieldConfig` straight to the card's
`PanelRenderer`, so one definition covers both.

### Two honest limits

- **This cannot outrank core's Heatmap card.** `sortSuggestions` places built-in
  panels ahead of every third-party one regardless of score, so `Best` only makes this
  the family's first card _within this plugin's suggestions_ — core's Heatmap still
  renders above it even though core cannot draw the overlays.
- **A plain multi-series time frame is not suggested**, even though
  `frameToBinnedHeatmap` would happily render it as ordinal rows (see
  [HeatmapRows](#heatmaprows)). The bucket-name signal is what distinguishes "this is
  a distribution" from "this is several metrics", and without it every time-series
  panel would carry a heatmap card.

## Divergences from the data plane spec

- **Only the first value field is displayed.** The spec allows multiple value
  fields per cell for extra dimensions; this plugin renders the first and
  ignores the rest (matching the spec's default display behavior, but with no
  option to pick another).
- **`+Inf` buckets are clamped** to the previous bucket's height for display
  rather than drawn as unbounded.
- **Ordinal fallback.** Wide frames without `le` labels are given synthetic
  unit-height buckets; these are a plugin convenience, not part of the spec.
- Value range (`valueMin`/`valueMax`) and bucket range (`yMin`/`yMax`) are
  computed from finite values only, defaulting to `0..0` / `0..1` when empty.

`frameToBinnedHeatmap` returns `null` when no usable cells can be derived, so the
caller can skip the heatmap layer.
