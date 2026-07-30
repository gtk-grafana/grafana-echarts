# Stream model (single axis)

The stream model is a set of **named layers over a shared time axis**: each layer
is a time-ordered list of values, and the layers are stacked into ribbons whose
combined thickness is the total. It backs the single render variant of the stream
family panel:

- **Theme river** (stacked ribbons on the ECharts `singleAxis` coordinate
  system) — `getThemeRiverSeries` in `src/lib/echarts/options/stream.ts`

The chart module is `src/lib/echarts/charts/stream.ts` and the converter is
`frameToStream` (`src/lib/echarts/converters/stream.ts`), which returns a
chart-agnostic model — `StreamData` (`{ layers: StreamLayer[] }`) where each
`StreamLayer` is `{ name, color, hidden, field?, points }` and `points` is
`Array<[epochMs, value]>`.

`themeRiver` is the only ECharts series that **requires** this coordinate system
(`ThemeRiverSeriesModel.dependencies` is `['singleAxis']`), which is why the family
is its own panel rather than a cartesian render variant. `scatter`,
`effectScatter`, `line` and `lines` also accept `coordinateSystem: 'singleAxis'`
and are candidates for a second variant; `lines` is not, because no data plane kind
carries the coordinate-pair polylines it needs — see
[echarts-coverage.md](./echarts-coverage.md).

> This family is the ECharts panel-type research doc's **Group 10** (single-axis /
> stream); the tracking issue numbers it 9. Same group, two numbering schemes.

## Grafana data plane equivalent

This model consumes the **Time series** kind
(https://grafana.com/developers/dataplane/timeseries) in two shapes:

| #   | Frame shape                                                | Dataplane kind                      | Layer identity                                              |
| --- | ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| 1   | time field + **N numeric** fields, in any number of frames | `TimeSeriesWide`, `TimeSeriesMulti` | one layer per numeric field, named by `getFieldDisplayName` |
| 2   | time field + **1 numeric** field + **≥1 string** field     | `TimeSeriesLong`, or a SQL table    | one layer per distinct value of the first string field      |

As everywhere else in this plugin, `meta.type` is never read — the shape is
inferred from the fields present, so an untyped frame carrying the right columns
flows through the same code.

Shape 2 makes this the **first model in the plugin that pivots a long frame**.
Both [time-series.md](./time-series.md) and [categorical.md](./categorical.md)
record the same gap ("`TimeSeriesLong` is not pivoted"); this family cannot punt on
it, because SQL sources and every SQL expression return exactly that shape (see
[stream-sources.md](./stream-sources.md)). The pivot is **scoped to this family** —
nothing about it changes the other models.

## Detection

`frameToStream` classifies **each frame independently** and merges the resulting
layers, so a response mixing both shapes renders as one river (fields-path layers
first, in frame then field order, then label-path layers in first-appearance
order).

The panel option `streamLayerSource` (`auto` / `fields` / `labels`) overrides the
classification. It is **JSON-only** in this phase — the editor radio ships with the
family's option surface — and defaults to `auto`:

| Source           | A frame is pivoted when                                                            |
| ---------------- | ---------------------------------------------------------------------------------- |
| `auto` (default) | it has a time field, **exactly one** numeric field, and at least one string field  |
| `fields`         | never                                                                              |
| `labels`         | it has a time field, **at least one** numeric field, and at least one string field |

Auto is deliberately narrow: a frame of `time, level, count, errors` reads both
ways ("two metrics" vs "one metric per level"), so Auto keeps the fields path and
`labels` is how a user says otherwise. Under `labels` the **first** numeric field
is the value and the rest are ignored.

## How a frame is read

### Fields path (shape 1)

Reuses `forEachTimeSeriesField` (`src/lib/echarts/converters/frames.ts`) — the same
walk the [time series model](./time-series.md) uses — so this is one of the
plugin's genuinely **multi-frame** models: a one-frame-per-series response
(Prometheus, Loki) needs no join.

| Grafana field                            | Used as                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| First `time` field                       | The x value of every point (epoch ms), via `resolveTimeField` |
| First `number` field (only if no `time`) | Fallback x — and consequently not emitted as a layer          |
| Every other `number` field               | One **layer**, `[x, value]` in row order                      |
| `string` fields                          | Ignored on this path                                          |
| `boolean` fields                         | Ignored                                                       |

Each layer keeps its source `field`, which is what lets the tooltip format with
that column's unit/decimals and surface its data links.

### Labels path (shape 2)

| Grafana field        | Used as                                           |
| -------------------- | ------------------------------------------------- |
| First `time` field   | The x value of every point                        |
| First `string` field | The **layer name** (one layer per distinct value) |
| First `number` field | The value                                         |
| Other fields         | Ignored                                           |

Layers appear in first-appearance order, and points within a layer likewise, which
is what makes the palette and the legend reproducible. A row whose label is
`null`/`undefined` is skipped. Layers on this path have **no `field`**: a layer is
a set of rows, not a column.

### Layer colors

- **Fields path** — the field's own Color scheme, via `getSeriesColor`.
- **Labels path** — the classic palette by layer position
  (`getPaletteColorByIndex`), the same categorical default hierarchy nodes and pie
  slices use. The single numeric field's color config would otherwise paint every
  ribbon alike.
- **Either path** — a legend color-picker override wins, matched by layer name
  through `getSeriesColorOverride`. Grafana's override engine can only apply a
  `byName` color to a _field_, so a label-path layer has to read it directly.

The colors reach ECharts as the **series palette** (`series.color`, in layer
order), not as per-item styles; see [ECharts data specification](#echarts-data-specification).

### Hidden layers

`getHiddenSeriesNames` (`src/lib/grafana/fields/seriesConfig.ts`) is read for both
paths, and a hidden layer is **kept in the model with `hidden: true`** rather than
dropped, so the legend can grey it and toggle it back. `visibleStreamLayers` is
what the series is built from. The generic `stripHiddenValueFields` pass in
`buildPanelChartOption` also removes hidden numeric columns before the converter
runs, but the legend builder is handed unstripped frames, so the flag is what keeps
chart and legend in lockstep.

## The contract, in five rules

1. **Missing means zero, not a gap.** This is the sharpest divergence from
   [time-series.md](./time-series.md), which writes `?? null` so a Grafana gap
   renders as a break. A stacked ribbon has no way to draw a hole, so
   `frameToStream` writes `?? 0`. **A data outage therefore reads as a genuine
   zero.** ECharts agrees: `ThemeRiverSeriesModel.fixData` zero-fills every
   `(layer, time)` combination missing from the data.
2. **Duplicate `(layer, time)` keys are summed** on the labels path. Two rows for
   one label at one timestamp would otherwise put two segments in a single ribbon,
   which has no defined baseline. Summing is the only aggregation consistent with
   stacking; upstream, a **Group by** transform is the explicit alternative.
3. **Row order is not load-bearing.** Every point carries its own timestamp
   (unlike the flame-graph nested set), so a sort transformation is harmless. No
   sorting or validation is performed either — values are handed to ECharts in row
   order, matching the time series model.
4. **The axis is always time**, pinned to the dashboard range via
   `getTimeAxisBounds` so the river lines up with sibling panels. `panelTypeToAxis`
   returns `'time'` for this family unconditionally: a response with no time field
   yields no layers at all rather than a category fallback.
5. **Values are stacked, so negatives distort the baseline.** They are passed
   through unchanged rather than clamped — see the divergences below.

## ECharts data specification

Pinned to **ECharts 6.1.0** (`package.json`).

### `series.themeRiver.data`

A flat array of `[date, value, name]` triples — `date` (string | number), `value`
(number), `name` (string, the layer). `toThemeRiverData` emits them layer by layer.

**Plain arrays are mandatory.** `ThemeRiverSeriesModel.getInitialData` filters the
raw data with `dataItem[2] !== undefined`, and `fixData` indexes `[0]`/`[1]`/`[2]`
directly, so an object item (`{ value, itemStyle }`) is silently dropped. That is
why per-layer color cannot ride on the data items.

**Colors come from the palette.** themeRiver's `defaultOption` sets
`colorBy: 'data'`, and ECharts' `dataColorPaletteTask` (`lib/visual/style.js`)
colors each item with `getColorFromPalette(name, scope, count)`, which **caches by
name** in `paletteNameMap` (`lib/model/mixin/palette.js`) and advances one palette
slot per _new_ name. Since dimension 2 is the series' `itemName`, every triple of a
layer resolves to the same color and palette position N paints the Nth layer name.
`getThemeRiverSeries` therefore hands `series.color` the layer colors in layer
order — and deliberately sets no `itemStyle.color`, which would clear
`colorFromPalette` and paint every ribbon alike.

**The "main river" caveat.** The option reference requires _"an event or theme with
a complete time quantum as main river … Once they are beyond the main river, the
layout would be wrong"_, because a baseline is computed per ribbon. 6.1.0's
`fixData` performs that zero-fill itself, from the **union of observed
timestamps**, so the converter does not pad: a layer that starts late still lays
out correctly. What ECharts cannot invent is a timestamp no layer reports.

**No `dataset` support** — `getInitialData` reads `option.data` directly, so this
series can never see a `dataset` + `encode`. Consistent with the plugin, which
hand-builds every `series.data`.

### `singleAxis`

The series has no layout box of its own: _"the positional information of the whole
theme river view reuses the positional information of a single time axis"_ —
`left`/`top`/`right`/`bottom`. `getStreamSingleAxis` therefore carries the panel
padding, and reserves height under the axis for its tick labels (the component
defaults to `position: 'bottom'` and there is no `containLabel` outside `grid`).
`splitLine` is turned off: a single axis would rule the whole plot area, drawing a
grid over the ribbons.

`boundaryGap` (on the _series_, default `["10%", "10%"]`) is the orthogonal padding
that keeps the ribbons off the top edge and clear of the axis line.

### Registration

`ThemeRiverChart` **and** `SingleAxisComponent` are both registered in
`src/lib/echarts/echarts.ts`: `ThemeRiverChart`'s own `install` does not pull in
the coordinate system it declares as a dependency.

## Divergences from the data plane spec

- **Nulls become `0`.** Rule 1 above. The spec's "no value" and a real zero are
  indistinguishable in the render; only the tooltip can tell them apart, and only
  where the layer has a source field with a "No value" text.
- **Negative values are not rejected or clamped.** A stacked stream with mixed
  signs produces a baseline that no longer reads as a total. Nothing warns; the
  edge-case panel in `provisioning/dashboards/stream/themeriver-basic.json` shows
  what it looks like.
- **Duplicate `(layer, time)` rows are summed** rather than passed through (rule
  2), which is a deliberate reshape of the response.
- **`TimeSeriesLong` is pivoted on the _first_ string field only.** The spec builds
  series identity from the combination of _all_ string columns; a frame with two
  label columns (say `service` and `region`) collapses onto the first one, and rows
  differing only in the second are summed. Use a transform or a SQL expression to
  build the composite label.
- **All numeric fields are used, per frame,** on the fields path. For
  `TimeSeriesMulti` the spec says only the first numeric field of each frame is the
  series and later ones are remainder data; this is more permissive, matching
  [time-series.md](./time-series.md).
- **Bool value fields are dropped** (`forEachTimeSeriesField` requires
  `FieldType.number`), although the spec allows them.
- **The numeric X fallback is inherited.** `resolveTimeField` elects the first
  numeric field when a frame has no time field, so a numeric column can end up
  read as epoch milliseconds. Unlike cartesian, nothing gates it here.
- **Min/Max and Thresholds are inert.** There is no exposed value axis — the
  orthogonal extent is the stacked total — and no grid for threshold lines or
  regions.
- **By-value color schemes are inert.** A ribbon is a whole series, so it takes one
  color; only fixed / by-series modes are meaningful.
- **No sorting or validation**, as above: unsorted or duplicate-timestamped input
  is handed to ECharts as it arrives.
- **Cardinality is not capped.** A high-cardinality query (Prometheus by pod)
  produces an unreadable river; nothing truncates it silently. The suggestion
  scorer withholds below two layers, and
  [stream-sources.md](./stream-sources.md) documents a top-N recipe.
- **Two layers with the same name merge in the render, not in the model.** ECharts
  derives its ribbons from the `name` dimension (`getLayerSeries`), so same-named
  layers become one ribbon, while `StreamData` still holds two — which shows up as a
  duplicate legend entry and a consumed palette slot. Only reachable by mixing both
  frame shapes (or two frames) whose names collide; a fix would merge them in the
  converter.
- **"All" tooltips are withheld.** ECharts builds an axis-triggered tooltip from
  the _global_ tooltip model (`_showAxisTooltip` in
  `component/tooltip/TooltipView`), never the per-series formatter this family
  attaches, so the generic model would read each triple's last element — the layer
  name — as the value. `streamChartModule.singleTooltipOnly` clamps a persisted
  `multi` back to Single, and the editor offers Single/Hidden only.
- **No drag-to-zoom.** `BrushComponent` attaches to a cartesian `grid`, which this
  family has none of, so `ChartModule.disableTimeBrush` suppresses the `brush`
  component the time axis would otherwise get.

`frameToStream` returns `null` when no layer can be derived (no time field, no
numeric field, or an empty response), letting callers fall back to a no-data view.
Hiding _every_ layer from the legend is not that case: the model keeps them and the
series renders empty, so the panel stays up and the legend can toggle them back.

## Example

The long CSV provisioned in `provisioning/dashboards/stream/themeriver-basic.json`
(abridged to two timestamps):

| time                 | level | count |
| -------------------- | ----- | ----- |
| 2026-07-29T00:00:00Z | error | 4     |
| 2026-07-29T00:00:00Z | warn  | 9     |
| 2026-07-29T01:00:00Z | error | 6     |
| 2026-07-29T01:00:00Z | warn  | 7     |

Exactly one numeric field and a string field, so Auto pivots it. `frameToStream`
returns:

```typescript
{
  layers: [
    { name: 'error', color: '#73BF69', hidden: false, points: [[1784073600000, 4], [1784077200000, 6]] },
    { name: 'warn',  color: '#F2CC0C', hidden: false, points: [[1784073600000, 9], [1784077200000, 7]] },
  ],
}
```

which `toThemeRiverData` flattens to the series `data`, layer by layer:

```javascript
[
  [1784073600000, 4, 'error'],
  [1784077200000, 6, 'error'],
  [1784073600000, 9, 'warn'],
  [1784077200000, 7, 'warn'],
];
```

with `series.color = ['#73BF69', '#F2CC0C']` — the palette ECharts resolves by
layer name, in that order.

## References

- ECharts `series.themeRiver` (data spec, `boundaryGap`, `singleAxisIndex`, and the
  "complete time quantum" note):
  https://echarts.apache.org/en/option.html#series-themeRiver
- Option-reference source for that note:
  https://github.com/apache/echarts-doc/blob/master/en/option/series/themeRiver.md
- ECharts `singleAxis` (layout box reused by the series):
  https://echarts.apache.org/en/option.html#singleAxis
- `fixData` zero-fill and the fixed dimension order (`time`, `value`, `name`):
  https://github.com/apache/echarts/blob/6.1.0/src/chart/themeRiver/ThemeRiverSeries.ts
- Palette resolution by item name (`getColorFromPalette`, `paletteNameMap`):
  https://github.com/apache/echarts/blob/6.1.0/src/model/mixin/palette.ts
- Grafana time series data plane kind:
  https://grafana.com/developers/dataplane/timeseries
- Which datasources produce these shapes: [stream-sources.md](./stream-sources.md)
