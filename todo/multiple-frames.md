# Multiple frames in categorical converters

## Problem

The categorical converters only read the **first** frame that has a numeric field
(via `findCategoricalFrame`) and ignore the rest. Multi-frame responses (e.g. the
time series "Multi" format, or one-frame-per-series datasources like Prometheus)
are **not** merged.

## Status

**Contract A is implemented for the category-axis cartesian path only**
(`converters/categoryCartesianModel.ts`). Still single-frame:

- `frameToMatrixHeatmap` (matrix heatmap layout)
- `frameToCategorical` — retained as-is for radar / parallel / hierarchy

## Implemented contract (category cartesian)

`framesToCategoryCartesian` splits on how many frames carry values, because
merging is only needed — and only unambiguous — when more than one does:

- **One value frame**: categories are that frame's labels verbatim and each numeric
  field keeps its values positionally. Duplicate labels are preserved (ECharts
  draws repeated category ticks), so this is byte-for-byte the old single-frame
  output. This is what keeps existing panels and canvas snapshots unchanged.
- **Several value frames**: categories are the union of every frame's labels in
  first-appearance order, and each series is joined onto them **by label** rather
  than by row position, so frames may order categories differently or cover
  different subsets. Resolutions for the questions this doc used to leave open:
  - _row ordering_ — union in first-appearance order, frames in response order
  - _missing cell_ — `null`, so it renders as a gap rather than a zero
  - _duplicate labels within a frame_ — first row wins, with a `debug()` warning
    (silently plotting the last would hide discarded data)
  - _shared vs chart-specific helper_ — chart-specific, to avoid changing radar /
    parallel / hierarchy behaviour as a side effect

A frame with no string field still falls back to row indices (`"0"`, `"1"`, ...),
which degrades the join to positional — the same fallback the single-frame model
uses.

### Why the order is centralized

Three derivations zip against the series index positionally — the converter, the
`cartesianSeriesFields` list (`yAxisIndex`, tooltip value formatters, tooltip field
resolver), and the legend builder. All three now read the same model, so the order
cannot drift between them. Anything added here must keep that property.

## Still open

- **Matrix heatmap**: needs its own decision. The remaining candidates from the
  original note are **B** — vertical stacking, same wide schema concatenated as more
  rows — and **C** — long format `[xCat, yCat, value]`, the canonical matrix shape
  but a different single-frame shape we also don't support today.
- Whether radar / parallel / hierarchy should adopt contract A too. Nothing blocks
  it; it just has not been asked for, and each has its own notion of what a second
  frame would mean.
