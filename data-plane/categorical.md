# Categorical model

The categorical model is the shared data-frame interpretation behind most
non-time, non-heatmap charts in this plugin:

- **Category-axis cartesian** (line / bar / scatter on a category x-axis) —
  `src/lib/echarts/converters/categoryCartesian.ts`
- **Radar** (multivariate) — `src/lib/echarts/converters/radar.ts`, see
  [multivariate.md](./multivariate.md)
- **Hierarchy flat fallback** (treemap / sunburst with no flame-graph frame) —
  `frameToHierarchy` in `src/lib/echarts/converters/hierarchy.ts`, see
  [hierarchy.md](./hierarchy.md)
- **Multi-value cartesian** (candlestick / boxplot) —
  `src/lib/echarts/converters/multiValueCartesian.ts`

The first three are thin adapters over `frameToCategorical`
(`src/lib/echarts/converters/categorical.ts`), which in turn uses the shared
helpers in `src/lib/echarts/converters/frames.ts`. Multi-value cartesian skips
`frameToCategorical` and calls those same helpers directly
(`findCategoricalFrame` + `resolveCategoriesFromFrame`), because it maps fields
by name convention rather than one series per numeric field.

**Pie and funnel are not part of this model.** They reduce fields with Grafana's
own `getFieldDisplayValues` driven by the standard `reduceOptions`
(`src/lib/echarts/converters/pie.ts`) and are multi-frame — see
[part-to-whole.md](./part-to-whole.md).

## Grafana data plane equivalent

This model consumes the **Numeric** kind — a Prometheus instant vector or a
SQL-like table of string and number columns. See
https://grafana.com/developers/dataplane/numeric.

The plugin does **not** branch on the declared frame type. It reads any frame
that has at least one numeric field, so `NumericWide`, `NumericMulti`, and
`NumericLong` all flow through the same code path. It also happily reads a
`TimeSeries*` frame this way, ignoring the time field.

## How a frame is read

`frameToCategorical` maps a single frame as follows:

| Grafana field        | Used as                                            |
| -------------------- | -------------------------------------------------- |
| First `string` field | The shared **categories** (x-axis / slices / axes) |
| Each `number` field  | One **series**, its positional `values` array      |
| `time` fields        | Ignored                                            |

- **Categories** come from the first string field's row values. With no string
  field, row indices (`"0"`, `"1"`, ...) are used
  (`resolveCategoriesFromFrame`).
- **Series** are every numeric field, named via
  `getFieldDisplayName` (which folds in field labels), colored from the field's
  standard Color scheme (`mapNumericFields`).
- **Alignment is positional**: `series.values[row]` is paired with
  `categories[row]`. Fields of differing lengths yield `null` on the longer axis.

Per-chart narrowing on top of this model:

- **Radar** turns each category into an axis (indicator) and each numeric field
  into a polygon; each axis `max` is the largest value any polygon reaches. See
  [multivariate.md](./multivariate.md).
- **Hierarchy** (flat fallback) uses only the first numeric field, turning each
  category into one top-level node. See [hierarchy.md](./hierarchy.md).
- **Multi-value cartesian** ignores the shared string categories when a time
  field is present (rows are labelled by timestamp and clipped to the dashboard
  time range) and resolves OHLC / five-number fields by name convention.

## Divergences from the data plane spec

- **Single frame only.** `findCategoricalFrame` returns the _first_ frame with a
  numeric field; all other frames are silently dropped. `NumericMulti` (and the
  time series "Multi" format, one frame per series) is **not** merged. This is a
  known gap tracked in `todo/multiple-frames.md`. The part-to-whole charts sidestep
  it by reducing through Grafana's own display pipeline instead — see
  [part-to-whole.md](./part-to-whole.md).
- **Labels are not used for identity.** The spec builds series identity from
  field name + labels (`NumericWide`) or from string-column dimensions
  (`NumericLong`). This plugin only uses labels for the display _name_ and never
  pivots a long-format frame into multiple dimensions — the first string field
  is always treated as the category axis, not as a dimension key.
- **First string field wins.** There is no way to choose which string field
  supplies the categories when a frame has several.
- **Time fields are ignored** for the category-axis, radar, and hierarchy paths,
  so a `TimeSeriesWide` frame renders as an unordered category chart rather than
  a time series.
- **No caps.** Very wide frames (many categories or series) are rendered as-is
  and can be unreadable.

`frameToCategorical` returns `null` when no frame has a numeric field, letting
callers fall back to a no-data view.
