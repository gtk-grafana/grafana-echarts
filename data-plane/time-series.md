# Time series model

The time series model is the plugin's `[x, y]` mapping: every numeric value
field, in every frame, becomes one ECharts series of two-element pairs drawn on
a continuous x-axis.

- Converter: `timeSeriesToEChartsOption` — `src/lib/echarts/converters/timeSeries.ts`
- Chart family: **time-axis cartesian** (line / bar / scatter / effectScatter) —
  `buildTimeOption` in `src/lib/echarts/charts/cartesian.ts`
- Also used for the **cartesian overlays** drawn on top of the binned heatmap —
  `buildBinnedHeatmapOption` in `src/lib/echarts/charts/binnedHeatmap.ts`, see
  [heatmap-binned.md](./heatmap-binned.md)
- Frame walking lives in `forEachTimeSeriesField` /
  `resolveTimeField` — `src/lib/echarts/converters/frames.ts`

The cartesian family picks this converter from the _data_, not from the series
type: `cartesianChartModule.buildOption` routes to `buildTimeOption` only when
`framesHaveTimeField(ctx.frames)` is true, and otherwise falls through to the
[categorical model](./categorical.md) on a `category` x-axis. The x-axis is
`type: 'time'` (`cartesianTimeDefaultOptions` in
`src/lib/echarts/options/cartesian.ts`) and is pinned to the dashboard time
range via `getTimeAxisBounds`, so gaps in this panel still line up with sibling
panels.

## Grafana data plane equivalent

This model consumes the **Time series** kind. See
https://grafana.com/developers/dataplane/timeseries.

As everywhere else in this plugin, `meta.type` is never read on this path — the
shape is inferred from the fields present. `TimeSeriesWide`, `TimeSeriesMulti`,
and `TimeSeriesLong` therefore all flow through the same code, as does any
untyped frame that happens to carry a time field and a numeric field.

The spec's wide rule — "if there are multiple numeric fields, the combination of
the time field with each value field in the frame creates each time series" — is
implemented literally by `forEachTimeSeriesField`, and then applied to every
frame rather than to one.

## How a frame is read

`forEachTimeSeriesField` visits each frame, resolves one X field for it, and
yields every other numeric field as a series:

| Grafana field                            | Used as                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| First `time` field                       | The **X** value of every pair (epoch ms), via `resolveTimeField`     |
| First `number` field (only if no `time`) | Fallback **X** — and consequently _not_ emitted as a series          |
| Every other `number` field               | One **series**, `[x, value]` pairs in row order                      |
| `string` fields                          | Ignored; labels reach the chart only through the series display name |
| Extra `time` fields                      | Ignored (the spec calls these "remainder data")                      |
| `boolean` fields                         | Ignored, although the spec allows a bool value field                 |

Per series the converter emits:

- **name** — `getFieldDisplayName(field, frame, frames)`, which folds in field
  labels and disambiguates across frames.
- **data** — `timeField.values.map((time, i) => [time, field.values[i] ?? null])`.
  The pair count is driven by the _time_ field, so a longer value field is
  truncated and a shorter one is padded with `null`.
- **type** — the panel series type, unless a per-field override replaces it (see
  below).
- **itemStyle.color** / **lineStyle.color** — both from `getSeriesColor`
  (`src/lib/echarts/style.ts`), so symbols and lines always agree.
- **zlevel** — `options.zLevel?.series`, which splits the series onto their own
  canvas layer. The canvas snapshot harness (`src/test/canvas.ts`) depends on
  this.
- **stack** — `STACK_GROUP_ID` (`'total'`, `src/editor/constants.ts`) when the
  series resolves to a stacked bar.
- **showSymbol** / **sampling** / **large** / **largeThreshold** — the
  density-driven fast-path props, spread in from `getSeriesPerfOptions`
  (`src/lib/echarts/performance/resolvers.ts`). Which keys appear depends on the
  resolved render type, and the density is measured across the whole frame set
  so every series in a chart takes the same path. The one per-series input is the
  field's own values, which keep markers on a series that draws no line (a single
  point, or values each separated by nulls) — otherwise it would render as nothing.
  See [performance.md](../docs/performance.md).

A frame with no time field _and_ only one numeric field contributes nothing: its
single numeric field is elected as the X field and then excluded from the series
set. Exclusion is by `field.name === timeField.name`, not by reference, so a
numeric field that shares its name with the X field is dropped as well.

## Multiple frames

This is one of only **three** genuinely multi-frame models in the plugin. The
other two are the [binned heatmap](./heatmap-binned.md) (which merges every
heatmap frame into one cell set) and [part-to-whole](./part-to-whole.md) (which
delegates frame handling to Grafana's `getFieldDisplayValues`). Everything in
the [categorical model](./categorical.md) — pie's category path, radar, category
cartesian, [multi-value.md](./multi-value.md), and the matrix heatmap — reads
only the first frame with a numeric field (`findCategoricalFrame`) and silently
drops the rest; see `todo/multiple-frames.md`.

Here, frames are iterated in order and each frame resolves **its own** X field,
so `TimeSeriesMulti` (one frame per series, non-aligned timestamps — the
Prometheus shape) renders correctly without any join or interpolation. Frames
that resolve no X field are skipped rather than aborting the panel.

Series order is `frame index, then field index`. `collectTimeSeriesFields`
(`src/lib/echarts/converters/frames.ts`) re-walks the frames with the same
iterator and flattens them to a `Field[]` in exactly that order, which is what
keeps the derived surfaces aligned to `seriesIndex`:

- y-axis assignment (`buildCartesianYAxes` — one axis per distinct unit, indexed
  by `axes.seriesYAxisIndex[i]`),
- the per-series tooltip value formatters
  (`cartesianSeriesFields` → `indexedFormatterResolver(..., 'seriesIndex')`),
- the heatmap overlay's value axes (`src/lib/echarts/charts/binnedHeatmap.ts`).

The Grafana DOM legend does not use `collectTimeSeriesFields` but calls
`forEachTimeSeriesField` directly (`buildTimeSeriesLegendItems` in
`src/lib/echarts/options/legendItems.ts`), which is the same walk and therefore
the same order.

## Per-field overrides

Two standard field-config overrides are read per value field, both via
`getFieldConfigFromField` (`src/lib/grafana/fields/fieldConfig.ts`):

- **`custom.seriesType`** (`resolveFieldSeriesType`) — a per-field render type
  wins over the panel default, but only when it narrows to
  `CartesianSingleValueSeriesType` (`line` / `bar` / `scatter` /
  `effectScatter`, `isCartesianSingleValueSeriesType` in
  `src/lib/echarts/charts/narrowing.ts`). A non-cartesian override such as `pie`
  is ignored and the panel default is used.
- **`custom.stackSeries`** (`resolveFieldStack`) — `override ?? panelStack`, so
  an explicit `false` on the field beats a panel default of `true`. Stacking is
  then gated on the _resolved_ render type being `bar`, because only bar series
  stack.

Two special cases fall out of the resolved type:

- **`heatmap` maps to `type: undefined`.** The plugin's heatmap panel type is
  not an ECharts series type on this path (the cell layer is a `custom` series),
  so the converter deliberately omits `series.type`. This is reachable: the
  overlay split (`frameHasCartesianOverride` in `src/editor/series.ts`) promotes
  a whole frame to an overlay when _any_ of its numeric fields carries a
  cartesian override, so sibling fields in that frame with no override of their
  own resolve to the panel's `heatmap` type and emit `type: undefined`.
- **`effectScatter` gets `showEffectOn: 'emphasis'`,** overriding the ECharts
  default of `'render'` so the ripple animation fires on hover instead of
  continuously. Every other resolved type leaves the property `undefined`.

## Hidden series

Before any converter runs, `buildPanelChartOption`
(`src/lib/echarts/options/panelOption.ts`) applies `stripHiddenValueFields`
(`src/lib/grafana/fields/fieldConfig.ts`), which removes numeric columns hidden
by the legend visibility toggle. It is applied to **every** family except
part-to-whole, which is excluded because it hides by _category_ name and reads
hidden state internally (`resolvePieSlices` — see
[part-to-whole.md](./part-to-whole.md)).

Only numeric fields are removed, so frames stay square and the time field
survives; the hidden set is read from `fieldConfig` rather than from
Grafana-applied `hideFrom.viz`, so un-toggling restores the series immediately.
The consequence for this model is that a hidden series never reaches
`timeSeriesToEChartsOption` at all — it is absent from the series array, the
y-axis unit set, and the tooltip, while the legend keeps a greyed item.

## Detection

`scoreCartesian` (`src/lib/echarts/charts/fitness.ts`) is the shared gate behind
both the Visualization Suggestions supplier
(`src/modules/cartesian/suggestions.ts`) and the panel-level `Auto` resolver. It
requires a `time` field, a `number` field, at least two rows, and non-instant
data; a declared `TimeSeriesWide` / `TimeSeriesMulti` / `TimeSeriesLong` frame
scores `Good`, anything else that passes the gate scores `OK`.

## ECharts data specification

Pinned to **ECharts 6.1.0** (`package.json`). The relevant contract is
`series.data` for `line`, `bar`, `scatter`, and `effectScatter`, all of which
share the same two-dimensional data description.

A data array is fundamentally a list of rows, where each column is a
"dimension"; on a cartesian grid dimension 0 is the x-axis and dimension 1 is
the y-axis (on `polar` they are the radius and angle axes instead). An item may
take any of these forms:

| Form             | Example                    | Notes                                                                        |
| ---------------- | -------------------------- | ---------------------------------------------------------------------------- |
| Bare scalar      | `23`                       | Valid **only** when there is one and only one axis of `type: 'category'`     |
| Positional tuple | `[1700000000000, 42]`      | `[x, y, ...extra dimensions]`; the form this plugin emits                    |
| Object           | `{ name: 'a', value: 42 }` | `value` may be a scalar or the tuple; adds `name`, `label`, `itemStyle`, ... |

The ECharts docs show object items mixed with bare scalars in one array, and
object items mixed with tuples in one array, so those combinations are
supported. _Unverified:_ mixing a bare scalar with a `[x, y]` tuple in the same
data array is not shown in the documentation and is not asserted here.

The bare-scalar form is what makes the [categorical model](./categorical.md)
possible and is exactly why it cannot be used here: this family renders on
`xAxis.type: 'time'`, not `'category'`, so every point must carry its own x
value and the tuple form is mandatory.

**Empty values.** `'-'`, `null`, `undefined`, and `NaN` all mean the data item
_does not exist_ — the ECharts documentation states explicitly that "not exist
does not mean its value is `0`". A line chart **breaks** at an empty value
(`connectNulls` defaults to `false`, and the plugin never sets it), and a
scatter chart simply draws no graphic element there. This is the whole reason
`timeSeriesToEChartsOption` writes `field.values[i] ?? null` rather than `?? 0`:
a Grafana gap must render as a gap, not as a dip to zero. A real `0` is
preserved, since `??` only catches `null` / `undefined`.

**Extra dimensions.** Anything past x and y is optional but addressable, which
is how a future encoding could carry per-point metadata without a second series:

- `visualMap` can map one or more dimensions to a visual channel (color, symbol
  size, ...),
- `series.symbolSize` accepts a callback that computes size from a dimension's
  value,
- `tooltip.formatter` and `series.label.formatter` reference them as `{@name}`
  (dimension by name) or `{@[n]}` (dimension by index), alongside the usual
  `{a}` / `{b}` / `{c}`.

This plugin emits two dimensions only. See
[echarts-coverage.md](./echarts-coverage.md) for what else the library offers.

**Coordinate systems.** `bar` is the constrained one: the docs state it "can
only be used in Cartesian coordinate system (i.e., grid component) or polar
coordinate system", so unlike `line` and `scatter` it cannot be lifted onto
`geo`, `calendar`, or a `singleAxis`. This plugin only ever uses `cartesian2d`
here, so the restriction is not currently felt, but it caps any reuse of the
converter's output on another coordinate system.

## Divergences from the data plane spec

- **Numeric X fallback.** `resolveTimeField` falls back to the first _numeric_
  field when a frame has no time field, so a frame can be plotted with a numeric
  X. The source doc comment undersells this — it says only "time (or fallback X)
  field", and the real explanation sits on the neighbouring
  `framesHaveTimeField`. Two things bound it in practice: the cartesian entry
  point gates on `framesHaveTimeField`, so a response with no time field
  anywhere goes to the category path instead, meaning the fallback is only
  reachable for a numeric-only frame travelling alongside a timed frame (or via
  the heatmap overlay path, which does not gate); and the elected X field is
  excluded from the series set, so the frame needs at least two numeric fields
  to render anything. When it does fire, the numeric X values are plotted on the
  shared `time` axis and are therefore read as epoch milliseconds.
- **`TimeSeriesLong` is not pivoted.** The spec builds one series per distinct
  combination of string-column values, iterating rows. This plugin ignores
  string fields entirely: a long frame yields one series per numeric column,
  whose x values contain the spec's permitted duplicate timestamps, so the line
  doubles back on itself instead of splitting into per-dimension series. Labels
  reach the chart only through `getFieldDisplayName`. This mirrors the same gap
  in the [categorical model](./categorical.md).
- **All numeric fields are used, per frame.** For `TimeSeriesMulti` the spec
  says only the first numeric field of each frame is the series and any later
  ones are remainder data. The plugin renders every numeric field in every
  frame. This is more permissive than the spec, not less, but it means remainder
  columns appear as chart series.
- **Bool value fields are dropped.** The spec allows a value field to be numeric
  _or_ bool; `forEachTimeSeriesField` requires `field.type === FieldType.number`.
- **No sorting, no validation.** The spec requires frames sorted by time
  ascending, no null timestamps, and no duplicate timestamps. None of these are
  checked or repaired; values are handed to ECharts in row order, so unsorted
  input draws in the order it arrives.
- **The first time field wins.** There is no way to choose which time field is
  the index when a frame has several.
- **Alignment is positional.** Consistent with the rest of the plugin, pairs are
  built by row index against the resolved time field; frames are assumed square.

`timeSeriesToEChartsOption` returns `null` when no frame yields a single series,
which the callers turn into an empty series array — `buildTimeOption` keeps the
axes and renders an empty plot rather than dropping the panel.

## References

- Grafana time series data plane kind:
  https://grafana.com/developers/dataplane/timeseries
- `getFieldDisplayName` (`packages/grafana-data/src/field/fieldState.ts`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/field/fieldState.ts
- `DataFrameType` (`packages/grafana-data/src/types/dataFrameTypes.ts`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/dataFrameTypes.ts
- ECharts `series-line.data` (item forms, empty values, extra dimensions):
  https://echarts.apache.org/en/option.html#series-line.data
- ECharts `series-line.connectNulls`:
  https://echarts.apache.org/en/option.html#series-line.connectNulls
- ECharts `series-bar` coordinate systems:
  https://echarts.apache.org/en/option.html#series-bar.coordinateSystem
- ECharts `series-effectScatter.showEffectOn`:
  https://echarts.apache.org/en/option.html#series-effectScatter.showEffectOn
