# ECharts series coverage

A survey of **ECharts' own `series.data` specifications** and which of them a
Grafana data frame can actually feed. Pinned to **ECharts 6.1.0** (the version in
`package.json`); every ECharts claim below was checked against that release's
source or its option reference, not against memory.

## Scope: this doc versus the parity docs

Two different questions, two different sets of docs:

- The **parity** docs — `src/modules/cartesian/parity/timeseries.md`,
  `src/modules/cartesian/parity/barchart.md`,
  `src/modules/cartesian/parity/xychart.md`,
  `src/modules/cartesian/parity/candlestick.md`,
  `src/modules/cartesian/parity/boxplot.md`,
  `src/modules/part-to-whole/parity.md`,
  `src/modules/multivariate/parity.md` and `src/modules/heatmap/parity.md` —
  track **editor options** for the panels that already ship: which ECharts and
  core-Grafana options are exposed, which are hard-coded, which are missing.
  They are per-panel.
- **This** doc tracks **data specs** per ECharts series type: the shape ECharts
  demands in `series.data`, and whether a data frame can be poured into it. It
  is per-series-type, and it covers types the plugin does not ship.

The deliverable here is the **verdict**, not the option surface. Reproducing
ECharts option tables would only rot; for option detail follow the reference
links in [References](#references).

## Master table

One row per member of the `SeriesType` union in `src/editor/types.ts` (23
members). The **plugin status** column is derived from
`supportedChartSeriesTypes` in `src/lib/echarts/charts/registry.ts`: anything not
in that list makes `resolveChartModule` throw
`Cannot resolve chart module, invalid <type>!`.

Verdicts use exactly four buckets:

- **works today** — a supported frame already reaches this series.
- **good fit, needs a converter** — an in-contract frame maps cleanly; only
  plugin code is missing.
- **needs a reshape or an out-of-contract frame** — the source exists but is not
  a data plane kind (node graph, flame graph) or needs a non-trivial pivot.
- **no Grafana source** — nothing in a frame supplies the required shape.

| Series type     | ECharts `series.data` spec                                                                  | Grafana frame that could supply it                                  | Fit verdict                                 | Plugin status                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `line`          | `[[x, y], ...]`, or bare `number[]` against a category axis; `dataset` + `encode` supported | `TimeSeriesWide` / `TimeSeriesMulti`, `NumericWide`                 | works today                                 | Enabled — [time-series.md](./time-series.md), [categorical.md](./categorical.md) |
| `bar`           | Same as `line`                                                                              | Same as `line`                                                      | works today                                 | Enabled — [time-series.md](./time-series.md), [categorical.md](./categorical.md) |
| `pie`           | `[{ name, value }, ...]`; one slice per item                                                | `NumericWide` / `NumericMulti`, reduced to one value per field      | works today                                 | Enabled — [part-to-whole.md](./part-to-whole.md)                                 |
| `scatter`       | `[[x, y], ...]`; extra dims usable for symbol size / color                                  | `TimeSeriesWide`, `NumericWide` (x from first field)                | works today                                 | Enabled — [time-series.md](./time-series.md)                                     |
| `effectScatter` | Identical to `scatter` (same model, animated symbols)                                       | Same as `scatter`                                                   | works today                                 | Enabled — [time-series.md](./time-series.md)                                     |
| `radar`         | `[{ value: number[], name }, ...]`; the array is positional against `radar.indicator`       | `NumericWide` — fields become indicators, rows become polygons      | works today                                 | Enabled — [categorical.md](./categorical.md)                                     |
| `tree`          | One nested root object `{ name, value, children: [...] }` in `data`                         | Flame graph nested set, or node graph edges resolved to a hierarchy | needs a reshape or an out-of-contract frame | Throws — [flame-graph.md](./flame-graph.md)                                      |
| `treemap`       | Array of nested `{ name, value, children }`; parents auto-sum (see below)                   | Flame graph nested set, or a flat categorical frame                 | works today                                 | Enabled — [hierarchy.md](./hierarchy.md)                                         |
| `sunburst`      | Same nested model as `treemap`                                                              | Same as `treemap`                                                   | works today                                 | Enabled — [hierarchy.md](./hierarchy.md)                                         |
| `boxplot`       | `[[min, Q1, median, Q3, max], ...]`, positional                                             | `NumericWide` / `TimeSeriesWide` matched by field-name convention   | works today                                 | Enabled — [multi-value.md](./multi-value.md)                                     |
| `candlestick`   | `[[open, close, lowest, highest], ...]` — **OCLH**, not OHLC (see below)                    | `TimeSeriesWide` with `open`/`high`/`low`/`close` fields            | works today                                 | Enabled — [multi-value.md](./multi-value.md)                                     |
| `heatmap`       | `[[xIndex, yIndex, value], ...]` against **two category axes** (see below)                  | `NumericWide` pivoted to a category x category matrix               | works today                                 | Enabled — [heatmap-matrix.md](./heatmap-matrix.md)                               |
| `map`           | `[{ name: <regionName>, value }, ...]` plus a GeoJSON registered via `registerMap`          | Any frame with a region-name string field and a numeric field       | needs a reshape or an out-of-contract frame | Throws — **out of scope this pass**                                              |
| `parallel`      | `[[d0, d1, ..., dn], ...]`; one row per polyline, one `parallelAxis` per dimension          | `NumericWide` — every numeric field becomes an axis                 | good fit, needs a converter                 | Throws                                                                           |
| `lines`         | `[{ coords: [[x1, y1], [x2, y2], ...] }, ...]`; polylines in cartesian or geo space         | none — no kind carries coordinate-pair polylines                    | no Grafana source                           | Throws                                                                           |
| `graph`         | `data`/`nodes` plus `links`/`edges`; arbitrary topology, cycles allowed                     | Node graph nodes + edges frames                                     | needs a reshape or an out-of-contract frame | Throws — [node-graph.md](./node-graph.md)                                        |
| `sankey`        | `data`/`nodes` plus `links`/`edges`, **DAG only** (see below)                               | Node graph nodes + edges frames                                     | needs a reshape or an out-of-contract frame | Throws — [node-graph.md](./node-graph.md)                                        |
| `funnel`        | `[{ name, value }, ...]`; same slice model as `pie`                                         | Same as `pie`                                                       | works today                                 | Enabled — [part-to-whole.md](./part-to-whole.md)                                 |
| `gauge`         | `[{ name, value }, ...]`, normally one item                                                 | Any numeric frame reduced to a single value                         | good fit, needs a converter                 | Throws                                                                           |
| `pictorialBar`  | Bar data (`number[]` or `[[x, y]]`) plus a `symbol` (path/image) per item                   | Same as `bar`                                                       | good fit, needs a converter                 | Throws                                                                           |
| `themeRiver`    | Flat `[[time, value, name], ...]` triples (see below)                                       | `TimeSeriesLong` — near-identical column layout                     | good fit, needs a converter                 | Throws                                                                           |
| `chord`         | `data`/`nodes` plus `links`/`edges` with weights; new in 6.0.0 (see below)                  | Node graph nodes + edges frames                                     | needs a reshape or an out-of-contract frame | Throws — [node-graph.md](./node-graph.md)                                        |
| `custom`        | No fixed spec — whatever `renderItem` reads, addressed through `encode`                     | Anything, by construction                                           | works today                                 | Registered but not routable — [heatmap-binned.md](./heatmap-binned.md)           |

### Counts

Resolving the constituent arrays of `supportedChartSeriesTypes` gives **12
enabled** and **11 throwing**:

| Array                      | Defined in                | Members                                       |
| -------------------------- | ------------------------- | --------------------------------------------- |
| `cartesianTimeSeriesTypes` | `src/editor/constants.ts` | `line`, `bar`, `scatter`, `effectScatter` (4) |
| `multiValueSeriesTypes`    | `src/editor/constants.ts` | `candlestick`, `boxplot` (2)                  |
| `heatmapSeriesTypes`       | `src/editor/constants.ts` | `heatmap` (1)                                 |
| `radarSeriesTypes`         | `src/editor/constants.ts` | `radar` (1)                                   |
| `partToWholeSeriesTypes`   | `src/editor/pie.ts`       | `pie` + `funnel` (2)                          |
| `hierarchySeriesTypes`     | `src/editor/constants.ts` | `treemap`, `sunburst` (2)                     |

4 + 2 + 1 + 1 + 2 + 2 = **12**. The remaining 11 of the 23 `SeriesType` members
— `tree`, `map`, `parallel`, `lines`, `graph`, `sankey`, `gauge`,
`pictorialBar`, `themeRiver`, `chord`, `custom` — throw from
`resolveChartModule`.

`custom` is the odd one out: `CustomChart` **is** registered in
`src/lib/echarts/echarts.ts` and the binned heatmap renders through it
(`src/lib/echarts/options/binnedHeatmap.ts`), but `'custom'` is not a routable
panel series type, so it is absent from `supportedChartSeriesTypes` and
`resolveChartModule('custom')` throws.

## Why flat frames are the crux

A Grafana `DataFrame` is column-oriented: a list of fields, each with a `values`
array. ECharts' `dataset.source` accepts exactly that shape — an object keyed by
column name, `{ product: [...], count: [...] }` — which is the closest ECharts
gets to a native frame. Two things stop that from being the obvious answer.

**`seriesLayoutBy` does not work in the key-value form.** The dataset handbook is
explicit: _"we don't support `seriesLayoutBy` in this format right now"_. Row/
column transposition is only available for the 2D-array `dataset.source`. A
frame is inherently column-per-field, so the one knob that would let a caller
reinterpret a frame as row-major is unavailable precisely where it would matter.

**The plugin does not use `dataset` at all.** Nothing under `src/` sets
`dataset`, and `encode` appears in exactly one place — the custom binned-heatmap
series (`src/lib/echarts/options/binnedHeatmap.ts`). Every converter in
`src/lib/echarts/converters/` hand-builds `series.data` arrays. Consequently
`DatasetComponent` and `TransformComponent` are not registered either (see
[Registration gap](#registration-gap)). Dataset support is therefore a latent
capability, not a current one.

### Which series can see a `dataset`

The dividing line in the 6.1.0 source is whether a series model's
`getInitialData` goes through `seriesModel.getSource()` — which resolves the
dataset chain via `SourceManager` — or reads `option.data` literally.

**Dataset-aware** (`getSource()`-backed, so a `dataset` + `encode` is visible):

| Series                                                          | Mechanism                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `line`, `bar`, `scatter`, `effectScatter`, `parallel`, `custom` | `createSeriesData(...)` with `useEncodeDefaulter`                                                                   |
| `heatmap`                                                       | `createSeriesData(null, this, { generateCoord: 'value' })`                                                          |
| `pie`, `funnel`, `map`                                          | `createSeriesDataSimply` with `coordDimensions: ['value']` + a name-based encoder                                   |
| `candlestick`, `boxplot`                                        | `createSeriesDataSimply` via `WhiskerBoxCommonMixin`; boxplot also ships a `registerTransform` (`boxplotTransform`) |

**Hand-built only** — `getInitialData` reads `option.data` / `option.nodes` /
`option.links` directly and can never see a dataset:

`tree`, `treemap`, `sunburst`, `sankey`, `graph`, `chord`, `themeRiver`, `lines`.

**Two corrections to the commonly-cited split.** `radar` and `gauge` are usually
grouped with the hand-built-only series; the source says otherwise. Both route
through `createSeriesDataSimply`, hence through `getSource()`:

- `radar` — `createSeriesDataSimply(this, { generateCoord: 'indicator_', generateCoordCount: Infinity })`.
  The object form of `opt` means `encodeDefine: seriesModel.getEncode()` is
  populated, so `encode` is honoured.
- `gauge` — `createSeriesDataSimply(this, ['value'])`. The **array** form skips
  the `encodeDefine` branch entirely, so a dataset would be read but
  `series.encode` ignored. See the [Unverified](#unverified) note.

The ECharts handbook's own list ("line, bar, pie, scatter, effectScatter,
parallel, candlestick, map, funnel, custom") is stale — it omits `heatmap` and
`boxplot`, both of which are dataset-aware in 6.1.0 — and its "cannot be edited
in dataset" set names only `treemap`, `graph` and `lines`, which understates the
real hand-built group above.

## Callouts

### Native heatmap needs two category axes, and fails silently in production

`series.heatmap` on `cartesian2d` requires both axes to be `type: 'category'`
**and** to be on-band (`boundaryGap: true`). ECharts enforces this with two
throws in `HeatmapView.prototype._renderOnGridLike`:

```js
if (process.env.NODE_ENV !== 'production') {
  if (!(xAxis.type === 'category' && yAxis.type === 'category')) {
    throw new Error('Heatmap on cartesian must have two category axes');
  }
  if (!(xAxis.onBand && yAxis.onBand)) {
    throw new Error('Heatmap on cartesian must have two axes with boundaryGap true');
  }
}
```

Both live inside the `__DEV__` guard, so a production build **strips them**.
Feed a native heatmap a `time` x-axis and it does not error — it computes a band
width from a non-band axis and quietly misrenders. Silent misrendering, not a
crash, is the hard justification for drawing continuous-axis heatmap cells with a
custom series instead: see [heatmap-binned.md](./heatmap-binned.md). The native
series is reserved for the genuine category x category case,
[heatmap-matrix.md](./heatmap-matrix.md).

### Candlestick is OCLH, not OHLC

`CandlestickSeriesModel.defaultValueDimensions` is, in order, `open`, `close`,
`lowest`, `highest`. So a positional data row is
`[open, close, lowest, highest]` — **index 1 is close and index 3 is high**,
the opposite of the OHLC ordering every financial datasource emits.

The plugin resolves this by reordering at build time:
`src/lib/echarts/converters/multiValueCartesian.ts` looks fields up by name
(`CANDLESTICK_FIELDS = ['open', 'high', 'low', 'close']`) and then emits
`rowValues([open, close, low, high], row)`.

If the plugin ever moves to `dataset`, the columns do **not** need reordering —
`encode` can remap them. For a source in `[time, open, high, low, close]` column
order:

```js
encode: { x: 0, y: [1, 4, 3, 2] }; // open, close, lowest, highest
```

Cross-reference [multi-value.md](./multi-value.md) for the field-name convention
and the boxplot five-number summary.

### `coordinateSystemUsage: 'data' | 'box'`

New in ECharts 6.0.0 and present in 6.1.0 — `CoordinateSystemUsageOption` is
declared in the shipped types and read by
`lib/core/CoordinateSystem.js`. It distinguishes two ways a component can attach
to a coordinate system:

- `'data'` — _"Each data item is laid out based on a coord sys."_ The default
  for series, for backward compatibility.
- `'box'` — _"The overall bounding rect or anchor point is calculated based on a
  coord sys."_ The default for non-series components.

Five series declare `coordinateSystemUsage: 'box'` in their `defaultOption`:
**`pie`, `funnel`, `tree`, `treemap`, `sankey`** — `funnel` is the one most often
missed in summaries of this set. `sunburst`, `chord`, `gauge` and `radar` declare no
usage at all and fall back to the series default `'data'`, with `chord` pinning
`coordinateSystem: 'none'`.

The correction that matters: `'box'` means **the whole chart is laid out inside
one cell** of the host coordinate system (matrix or calendar), which is what
makes small-multiple pies-in-a-grid work. It does **not** mean a pie is
positioned per data point on a cartesian or geo plane. Declaring
`coordinateSystemUsage: 'data'` on a non-series component is an explicit error in
dev builds:
`coordinateSystemUsage "data" is not supported in non-series components.`

### themeRiver: the interesting near-miss

`series.themeRiver.data` is a flat array of `[time, value, name]` triples —
structurally almost exactly a Grafana `TimeSeriesLong` frame with a time field, a
numeric field and one string label field. That is the closest any unimplemented
ECharts series gets to an in-contract frame, which is why it lands in _good fit,
needs a converter_.

Two catches:

1. **No `dataset` support.** `ThemeRiverSeriesModel.prototype.getInitialData`
   filters `option.data` directly; the source never passes through
   `getSource()`.
2. **The main river must span the full period.** The option reference states
   that you must _"provide an event or theme with a complete time quantum as
   main river"_, that other themes' missing points default to `0`, and that
   _"[o]nce they are beyond the main river, the layout would be wrong"_, because
   a baseline is computed per ribbon.

Worth noting against the second point: 6.1.0's
`ThemeRiverSeriesModel.prototype.fixData` **does** perform the zero-fill itself.
It collects the union of all time keys across layers and appends
`[timeValue, 0, name]` for every layer/time combination that is missing. So a
converter does not have to pad the frame — but it does have to guarantee that at
least one layer covers the full range, since the union of observed timestamps is
all `fixData` has to work from.

### Sankey is DAG-only

`sankeyLayout.js` runs Kahn's algorithm over the link set and hard-fails on a
cycle:

```js
throw new Error('Sankey is a DAG, the original data has cycle!');
```

This throw is **not** behind `__DEV__`, so it takes the panel down in production
too. The natural Grafana source for a sankey is a node graph edges frame — and
service graphs routinely contain cycles (retries, bidirectional RPC, A→B→A call
chains). Any sankey converter therefore needs an explicit cycle policy (detect
and drop back-edges, or refuse and fall back) rather than passing edges through.
`graph` and `chord` have no such restriction. See
[node-graph.md](./node-graph.md) for the edges/nodes frame format.

### Chord is new in 6.0.0

`series.chord` was added in **ECharts 6.0.0**; the option reference tags it
`version 6.0.0`. It is unrelated to the `chord` series that existed in ECharts 2
and was removed in ECharts 3 — the old one was a different implementation with a
different option surface, so pre-3.x examples do not apply.

Its data model is the node/link graph model:
`ChordSeriesModel.prototype.getInitialData` reads
`option.edges || option.links` and `option.data || option.nodes`, then builds a
graph with `createGraphFromNodeEdge`. So it consumes the same input as `graph`
and `sankey`, without the DAG restriction.

## Geo and map are out of scope

`map` (and the geo coordinate system generally) is **deliberately not covered in
this pass**. It keeps a table row above, marked out of scope: the gap is not the
frame — a region-name string field plus a numeric field is an ordinary Numeric
frame — but the out-of-band GeoJSON that `echarts.registerMap` requires, plus
projection and region-name normalization. That is its own design problem.

## Registration gap

`src/lib/echarts/echarts.ts` imports from `echarts/core` and registers a
deliberately narrow set rather than the full barrel, so webpack can tree-shake.
Currently registered:

- **Series** — `LineChart`, `BarChart`, `ScatterChart`, `EffectScatterChart`,
  `CandlestickChart`, `BoxplotChart`, `PieChart`, `FunnelChart`, `RadarChart`,
  `TreemapChart`, `SunburstChart`, `CustomChart`, `HeatmapChart` (13 — one more
  than the 12 routable types, because `CustomChart` backs the binned heatmap).
- **Components** — `GridComponent`, `TooltipComponent`, `LegendComponent`,
  `TitleComponent`, `AxisPointerComponent`, `BrushComponent`, `RadarComponent`,
  `VisualMapContinuousComponent`, `MarkLineComponent`, `MarkAreaComponent`.
- **Features** — `LegacyGridContainLabel` (required in ECharts 6 or
  `grid.containLabel` is a no-op).
- **Renderer** — `CanvasRenderer`.

Not registered and relevant here: `DatasetComponent` and `TransformComponent`
(no dataset path today), `VisualMapPiecewiseComponent`, `DataZoomComponent`,
`ToolboxComponent` (present but commented out), `MarkPointComponent`,
`MatrixComponent` and `CalendarComponent` (the two box coordinate systems that
`coordinateSystemUsage: 'box'` targets).

What each roadmap type would additionally need to import from `echarts/charts`
(and, where applicable, `echarts/components`):

| Roadmap type   | Chart import        | Extra component import                                                                                                     |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `tree`         | `TreeChart`         | none — self-contained                                                                                                      |
| `parallel`     | `ParallelChart`     | none — its `install` calls `use(ParallelComponent)` internally                                                             |
| `lines`        | `LinesChart`        | `GridComponent` (already registered) for cartesian; `GeoComponent` for geo                                                 |
| `graph`        | `GraphChart`        | none — ships its own `View` coordinate system                                                                              |
| `sankey`       | `SankeyChart`       | none — self-contained                                                                                                      |
| `gauge`        | `GaugeChart`        | none — self-contained                                                                                                      |
| `pictorialBar` | `PictorialBarChart` | none — shares the bar grid layout, which `GridComponent` already covers                                                    |
| `themeRiver`   | `ThemeRiverChart`   | **`SingleAxisComponent`** — `ThemeRiverSeriesModel.dependencies = ['singleAxis']` and its `install` does _not_ register it |
| `chord`        | `ChordChart`        | none — self-contained                                                                                                      |
| `map`          | `MapChart`          | none at import time — its `install` calls `use(installGeo)`; but a GeoJSON still has to be supplied via `registerMap`      |

Adopting `dataset` for any series would additionally require registering
`DatasetComponent` (and `TransformComponent` if ECharts-side transforms such as
`boxplotTransform` are used).

## Unverified

Three items were checked but are recorded with reservations:

- **`gauge` `dataset` support — partially verified, behaviour unconfirmed.**
  `GaugeSeriesModel.prototype.getInitialData` calls
  `createSeriesDataSimply(this, ['value'])`, and `createSeriesDataSimply` reads
  `seriesModel.getSource()`, so the dataset chain _is_ resolved. But the array
  form of its `opt` argument bypasses the
  `extend({ encodeDefine: seriesModel.getEncode() }, opt)` branch, so
  `series.encode` is not applied. Whether a `dataset` + gauge combination
  actually renders sensibly end to end was not tested and is not documented.
- **`lines` `value` semantics — unverified.** The option reference documents only
  `name`, `coords`, `lineStyle` and `label` for `series.lines.data`, but
  `LinesSeriesModel.prototype.getInitialData` reads `dataItem.value` and indexes
  into it (`value[dimIndex]`) when the item is an object rather than a bare
  coordinate array. What that value is _for_ — `visualMap` input, tooltip, effect
  sizing — is not stated anywhere and was not confirmed.
- **`treemap` parent auto-summing — verified in source, undocumented upstream.**
  Both `TreemapSeries.js` and `SunburstSeries.js` define a private
  `completeTreeValue(dataNode)` that post-order traverses the tree and, with the
  comment _"If value of none-leaf node is not set, calculate it by suming up the
  value of all children"_, assigns the child sum whenever a node's value is
  `null` or `NaN`. Array-valued nodes use element `0`. So a converter may leave
  interior node values unset.

## References

- ECharts option reference (all series): https://echarts.apache.org/en/option.html
- ECharts dataset handbook (dataset support list, `seriesLayoutBy` limitation):
  https://echarts.apache.org/handbook/en/concepts/dataset/
- Option reference source (verbatim text quoted above lives here):
  https://github.com/apache/echarts-doc/tree/master/en/option/series
- `series.themeRiver.data` "main river" note:
  https://github.com/apache/echarts-doc/blob/master/en/option/series/themeRiver.md
- `series.chord` (tagged version 6.0.0):
  https://github.com/apache/echarts-doc/blob/master/en/option/series/chord.md
- ECharts 6 upgrade guide (`grid.containLabel`, coordinate system changes):
  https://echarts.apache.org/handbook/en/basics/release-note/v6-upgrade-guide/
- Import-by-parts / modular registration:
  https://echarts.apache.org/handbook/en/basics/import
- ECharts 6.1.0 source (paths cited above are relative to the published package):
  https://github.com/apache/echarts/tree/6.1.0
- Grafana data plane contract: https://grafana.com/developers/dataplane/
