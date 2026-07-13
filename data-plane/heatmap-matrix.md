# Matrix heatmap

The matrix heatmap renders a category x category grid: a discrete cell for every
(column, row) pair, colored by value. It is the native ECharts heatmap series
(`[xIndex, yIndex, value]` tuples against two category axes), unlike the
[binned heatmap](./heatmap-binned.md), which draws continuous cell rectangles.

- Converter: `frameToMatrixHeatmap` — `src/lib/echarts/converters/matrixHeatmap.ts`

## Grafana data plane equivalent

There is **no dedicated Grafana data plane type for a matrix heatmap.** The
Grafana Heatmap kind (`heatmap-rows` / `heatmap-cells`, see
https://grafana.com/developers/dataplane/heatmap) is instead handled by the
[binned heatmap](./heatmap-binned.md).

This converter reuses the shared [categorical model](./categorical.md), so it
consumes the **Numeric** kind (wide / pivot shape) — see
https://grafana.com/developers/dataplane/numeric — and pivots it into a matrix.

## How a frame is read

`frameToMatrixHeatmap` uses the same `findCategoricalFrame` / `resolveCategories`
/ `mapNumericFields` helpers as the categorical model:

| Grafana field        | Used as                                           |
| -------------------- | ------------------------------------------------- |
| First `string` field | **Y categories** (rows), one per data row         |
| Each `number` field  | **X category** (column), labelled by display name |
| cell `[c, r]`        | column `c`'s numeric value at row `r`             |

Non-finite values become `null` so the tile renders empty rather than as `0`.
`valueMin`/`valueMax` (finite values only) size the ECharts `visualMap`,
defaulting to `0..0` when there are no finite values.

## Divergences from the data plane spec

Because it is built on the categorical model, it inherits the same limitations
(see [categorical.md](./categorical.md)):

- **Single frame only.** Only the first frame with a numeric field is used;
  additional frames (`NumericMulti`, one-frame-per-series responses) are not
  merged. Tracked in `todo/multiple-frames.md`.
- **No long-format pivot.** A `NumericLong` frame with several string dimension
  columns is not pivoted into a matrix; only the first string field is treated as
  the Y axis and each numeric field is a column.
- **First string field wins** as the Y axis; there is no selector.
- **Positional alignment** — `field.values[row]` is assumed to line up with the
  row's category.

`frameToMatrixHeatmap` returns `null` when no frame has a numeric field, so the
caller can render an empty panel.
