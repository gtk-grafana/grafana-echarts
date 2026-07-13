# Categorical model

The categorical model is the shared data-frame interpretation behind every
non-time, non-heatmap chart in this plugin:

- **Pie** (part-to-whole) — `src/lib/echarts/converters/pie.ts`
- **Radar** (multivariate) — `src/lib/echarts/converters/radar.ts`
- **Category-axis cartesian** (line / bar / scatter on a category x-axis) —
  `src/lib/echarts/converters/categoryCartesian.ts`
- **Multi-value cartesian** (candlestick / boxplot) —
  `src/lib/echarts/converters/multiValueCartesian.ts`

All of these are thin adapters over `frameToCategorical`
(`src/lib/echarts/converters/categorical.ts`), which in turn uses the shared
helpers in `src/lib/echarts/converters/frames.ts`.

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
  (`resolveCategories`).
- **Series** are every numeric field, named via
  `getFieldDisplayName` (which folds in field labels), colored from the field's
  standard Color scheme (`mapNumericFields`).
- **Alignment is positional**: `series.values[row]` is paired with
  `categories[row]`. Fields of differing lengths yield `null` on the longer axis.

Per-chart narrowing on top of this model:

- **Pie** uses only the first numeric field (one value per slice); extra numeric
  fields are dropped.
- **Radar** turns each category into an axis (indicator) and each numeric field
  into a polygon; each axis `max` is the largest value any polygon reaches.
- **Multi-value cartesian** ignores the shared string categories when a time
  field is present (rows are labelled by timestamp and clipped to the dashboard
  time range) and resolves OHLC / five-number fields by name convention.

## Divergences from the data plane spec

- **Single frame only.** `findCategoricalFrame` returns the _first_ frame with a
  numeric field; all other frames are silently dropped. `NumericMulti` (and the
  time series "Multi" format, one frame per series) is **not** merged. This is a
  known gap tracked in `todo/multiple-frames.md`.
- **Labels are not used for identity.** The spec builds series identity from
  field name + labels (`NumericWide`) or from string-column dimensions
  (`NumericLong`). This plugin only uses labels for the display _name_ and never
  pivots a long-format frame into multiple dimensions — the first string field
  is always treated as the category axis, not as a dimension key.
- **First string field wins.** There is no way to choose which string field
  supplies the categories when a frame has several.
- **Time fields are ignored** for the category-axis, pie, and radar paths, so a
  `TimeSeriesWide` frame renders as an unordered category chart rather than a
  time series.
- **No caps.** Very wide frames (many categories or series) are rendered as-is
  and can be unreadable.

`frameToCategorical` returns `null` when no frame has a numeric field, letting
callers fall back to a no-data view.
