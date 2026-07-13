# Binned heatmap

The binned heatmap is the plugin's rendering of Grafana's native **Heatmap**
data plane kind: cells with explicit bounds drawn against a continuous x-axis
(time or numeric) and a bucketed y-axis.

- Converter: `frameToBinnedHeatmap` — `src/lib/echarts/converters/binnedHeatmap.ts`
- Chart family: the composite **Heatmap** panel (`seriesType === 'heatmap'`)
- Suggested automatically when Grafana tags a frame `HeatmapRows` or
  `HeatmapCells` — `src/modules/heatmap/suggestions.ts`

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
