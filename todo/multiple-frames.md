# Multiple frames in categorical converters

## Problem

The categorical converters only read the **first** frame that has a numeric field
(via `findCategoricalFrame`) and ignore the rest. Multi-frame responses (e.g. the
time series "Multi" format, or one-frame-per-series datasources like Prometheus)
are **not** merged.

This affects the whole category family that shares the helper:

- `frameToCategorical` (line / bar / scatter on a category axis)
- `frameToMatrixHeatmap` (matrix heatmap layout)

## Current behavior

Only a single frame is supported. For matrix, that first frame supplies the Y
(row) categories from its string field, and each numeric field becomes an X
(column). Additional frames are silently dropped.

## Why it's not fixed yet

"Merge frames" is ambiguous and needs a decided data-shape contract before
implementation:

- **A** — one frame per column: union rows by category label, each frame = an X
  column (most idiomatic for Grafana Multi / Prometheus). Requires a
  positional -> label-keyed row join.
- **B** — vertical stacking: same wide schema across frames, concatenated as more
  rows.
- **C** — long format `[xCat, yCat, value]`: the canonical matrix shape, but a
  different single-frame shape we also don't support today.

Open questions: row ordering, missing-cell handling (null tile), duplicate
labels, and whether the fix lives in a shared helper (consistent across category
charts) or matrix-only.
