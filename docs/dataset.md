# ECharts `dataset`

## Goal

Decide where, if anywhere, the plugin should feed ECharts through
`option.dataset` + per-series `encode` instead of hand-built `series.data`
arrays. This doc records the trade-off; it is not a migration plan.

For the per-series-type question of _which_ ECharts series can see a dataset at
all, see [data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md) —
that split was verified against the 6.1.0 source and is not repeated here.

## Where we are today

Nothing under `src/` sets `dataset`. Eleven call sites in
`src/lib/echarts/converters/` and `src/lib/echarts/options/` materialize
`series.data` by hand, each with its own shape: `[time, value]` tuples,
bare `number[]`, positional N-tuples, `{ name, value, itemStyle }` objects, and
nested trees. `DatasetComponent` and `TransformComponent` are not registered in
`src/lib/echarts/echarts.ts`.

A Grafana `DataFrame` is column-oriented, which maps directly onto ECharts'
keyed-columns source format (`{ time: [...], v0: [...] }`). That correspondence
is what makes dataset attractive — for the frames that are already wide.

## The scope boundary comes first

`treemap` and `sunburst` read `option.data` directly and can **never** see a
dataset. That is the entire hierarchy panel. The binned heatmap computes cell
rectangles rather than passing frame columns through, so a dataset buys it
nothing.

So this is not a migration that ends with one data path. It ends with **two**,
permanently. Every design decision below should be read against the project's
first stated goal — _simple, clean, and maintainable code is the top priority_ —
because adding a second data path is a real cost against it.

## Pros

**Removes the per-point tuple allocation.** The time-series converter currently
runs `timeField.values.map((time, i) => [time, field.values[i] ?? null])` —
one 2-element array per point, per series. With 500 series this is the dominant
source of garbage, and it lines up with the measured ~4.7s of GC. A keyed-columns
dataset hands ECharts the frame's existing arrays by reference and the tuple
layer disappears.

Two honest qualifications. ECharts still copies every value into its internal
`DataStore` chunks (`_initDataFromProvider`), so this is not zero-copy end to
end — it removes the intermediate, not the store. And it does not touch the
larger costs in the profile, which are scene-graph and raster work
(`Group.traverse`/`doUpdateZ` ~20%, fill/stroke ~15%, `SymbolDraw` ~11%), not
ingestion.

**Shared columns are parsed once.** With one dataset per frame, a wide frame's
time column is read once rather than once per value field.

**Dimension typing unlocks TypedArray storage.** Declaring
`dimensions: [{ name: 'time', type: 'time' }, { name: 'v0', type: 'float' }]`
lets ECharts back numeric columns with TypedArrays, which targets the same GC
pressure.

**Candlestick column reordering becomes declarative.** ECharts wants OCLH;
datasources emit OHLC. `src/lib/echarts/converters/multiValueCartesian.ts`
reorders by hand today. `encode: { x: 0, y: [1, 4, 3, 2] }` expresses it
directly.

**Legend metadata stops re-materializing data.**
`buildMultiValueCartesianLegendItems` in `src/lib/echarts/options/legendItems.ts`
re-runs the whole converter just to read each series' `name` and
`itemStyle.color`. Separating data from config removes the reason for that.

**It is the substrate for data links.** There is no `dataIndex` → frame-row
infrastructure anywhere today, and no click handling at all. Under a dataset, a
row index _is_ a frame row index. Data links are currently registered as
standard options in the parity docs but consumed nowhere; this is what would
make them implementable.

**It is closer to the API editor tier.** `docs/options-modes.md` describes a
future raw-ECharts tier. A user writing ECharts config by hand expects `encode`
against named dimensions, not opaque pre-baked arrays.

## Cons

**`params.value` silently becomes the whole row.** This is the sharpest risk and
it fails without a type error or a test failure.

Under a keyed-columns source, ECharts assembles each raw data item across _every_
declared dimension
(`rawSourceItemGetterMap[SOURCE_FORMAT_KEYED_COLUMNS]` in
`lib/data/helper/dataProvider.js`), and `getDataParams` passes that whole row
through as `params.value`. So with a dataset of `[time, v0, v1, v2]`, a series
encoding `y: 'v0'` still receives `[t, a, b, c]`.

`unwrapTooltipValue` (`src/lib/echarts/tooltip/template.ts:45`) does:

```ts
return Array.isArray(eChartValue) ? eChartValue[eChartValue.length - 1] : eChartValue;
```

Correct for a `[time, value]` tuple. Under a shared dataset it returns the last
_value column_ for every series — so every cartesian tooltip shows the same
wrong number.

Note the failure profile: a frame with exactly one value field yields
`[time, v0]`, whose last element is correct. **Single-series charts work;
multi-series charts break.** A prototype tested on simple fixtures looks fine.

Correct resolution requires going through `params.encode.y[0]` and
`params.dimensionNames` in all six tooltip builders. Related: `$vars` is fixed at
`['seriesName', 'name', 'value']`, so `{c}`-style templates cannot reach extra
dimensions either.

**Per-item styling cannot live in a dataset.** Pie
(`src/lib/echarts/charts/pie.ts`), funnel (`src/lib/echarts/options/funnel.ts`)
and radar (`src/lib/echarts/converters/radar.ts`) all emit
`{ name, value, itemStyle, label, emphasis }` objects. A dataset carries values,
not styles. Moving them means rebuilding the color path onto `itemStyle`
callbacks, `colorBy`, or `visualMap` — and pie's per-slice contrast label color
(`resolvePieLabelColor`) has no clean dataset equivalent.

This inverts the cost/benefit: **the families where a dataset saves the least —
pie, funnel and radar handle tens of items, not thousands — are the ones where
adopting it costs the most.**

**Positional coupling must be preserved deliberately.** Tooltip resolution
(`indexedFormatterResolver`), y-axis assignment
(`src/lib/echarts/charts/cartesian.ts`) and threshold attachment to `series[0]`
are all positional, and they depend on series being emitted one-per-field in
converter order. Letting ECharts auto-generate series from dataset dimensions
would break all three at once. Any adoption must keep emitting series
explicitly and use the dataset only as the value source.

**Hardcoded dimension indices.** `HEATMAP_VALUE_DIM = 4`
(`src/lib/echarts/options/constants.ts`) and `MATRIX_VALUE_DIM = 2`
(`src/lib/echarts/options/matrixHeatmap.ts`) drive both `visualMap.dimension`
and tooltip tuple indexing. Re-dimensioning silently breaks heatmap color
mapping.

**`stripHiddenValueFields` shifts columns.** It drops hidden numeric fields from
frames upstream in `src/lib/grafana/fields/fieldConfig.ts`, which moves
dimension positions. Naming dimensions rather than indexing them avoids this;
indexing them reintroduces off-by-one bugs.

**The unit tests will not catch the main failure.** The 66 committed canvas
snapshots are a genuine regression net, and the standing rule in
`src/lib/components/__snapshots__/AGENTS.md` means any movement is real signal.
But roughly 35 tooltip assertions construct the `params` object by hand, so they
keep passing while real tooltips break — precisely the failure above. An
instance-driven tooltip test is a prerequisite, not a follow-up.

**Bundle cost.** `DatasetComponent` (plus `TransformComponent` if ECharts-side
transforms are used) has to be registered. The repo actively manages bundle size
via a webpack `splitChunks` cache group and a CI bundle-stats workflow; the cost
is small but lands in the shared async chunk.

**The incremental-update benefit is unreachable today.**
`src/lib/components/EChart.tsx` calls `setOption(option, { notMerge: true })`,
replacing everything each render. That neutralizes the stale-series merge
hazards dataset would otherwise introduce — but it also means the "swap data
without rebuilding config" benefit is not realized. Capturing it would mean
moving to `replaceMerge`, which is a separate and larger change.

## Implications

**Dataset is not the performance fix.** It addresses GC pressure, which is
roughly half the measured problem. The scene-graph and raster costs — the other
half — are addressed by `showSymbol: false`, LTTB `sampling`, `large`, and
`useDirtyRect`. Those levers are cheaper, lower-risk, and independent. Dataset
should be evaluated on its architectural merits, not sold as the perf remedy.

**The natural scope is the time-series cartesian path and nothing else.** That
is where the frame is already columnar, the styling is already per-series rather
than per-item, and all of the measured pain lives. Pie, funnel, radar and
hierarchy should stay on hand-built data — as a deliberate boundary, not as
migration debt.

**The architectural commitment is the return type.** `ChartModule.buildOption`
would return `{ series, dataset? }` instead of series alone, and
`buildPanelChartOption` would thread both. That is the piece that is hard to
reverse.

**Two things should be resolved before any dataset series ships:** tooltip value
resolution via `encode`/`dimensionNames`, and an instance-driven tooltip test.
Without both, the most likely outcome is shipping wrong numbers in every
multi-series tooltip with a green test suite.

## Notes on the existing prototype

`gtk-grafana/performance-options` implements the time-series half of this. It
emits one keyed-columns dataset per frame (dimensions `time` + `v<fieldIndex>`,
holding the `DataFrame` arrays by reference), changes the converter's return type
to `{ series, dataset }`, threads it through `charts/cartesian.ts` and
`charts/binnedHeatmap.ts`, and registers `DatasetComponent`. So it already makes
the architectural commitment described above, and already pays the bundle cost.

**The tooltip bug is live, and the dataset widens it.** No file under
`src/lib/echarts/tooltip/` changed on the branch — `unwrapTooltipValue` is
byte-identical to `main`, and neither `params.encode` nor `params.dimensionNames`
is referenced anywhere in `src`. Its doc comment now describes a `[time, value]`
shape the converter no longer produces. Both consumers are live
(`tooltipNumeric` and `formatTooltipValue`, the latter wired in as the shared
cartesian `valueFormatter` in `src/lib/echarts/tooltip/option.ts`), so on a wide
frame every series' tooltip resolves to the last value column rather than its own
`encode.y`. This is the prerequisite from the previous section, unmet.

**`zlevel` is preserved.** An earlier reading of this branch held that it dropped
`zlevel: options.zLevel?.series` and thereby weakened the canvas snapshot
harness. That is not the case: the key moved out of the inline series literal in
`converters/timeSeries.ts` into `getSeriesPerfOptions`
(`src/lib/echarts/options/performance.ts`), which returns it on every path. The
resolved value is unchanged from `main` and `src/test/canvas.ts` still gets its
separate series layer. Worth noting only as coupling — the canvas harness'
zlevel contract is now maintained in the performance module rather than the
converter, so a future change to perf options could disturb the test harness
from a distance.

**The dataset change is not separable from the performance defaults.** It is
entangled with them inside a single commit, and inside a single call site — the
same object literal that carries `datasetIndex`/`encode` also spreads
`getSeriesPerfOptions(...)`, which is what applies `showSymbol`, `sampling`,
`large` and animation thresholds. Splitting them so that snapshot movement is
attributable to one cause rather than two means unpicking that commit, not
reordering commits. This matters because those defaults are exactly the
independent levers the previous section recommends evaluating on their own.

## References

- Dataset concept and `seriesLayoutBy` limitation:
  https://echarts.apache.org/handbook/en/concepts/dataset/
- Data transforms (`filter`, `sort`, external transforms):
  https://echarts.apache.org/handbook/en/concepts/data-transform/
- Which series are dataset-aware in 6.1.0:
  [data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md)
- Editor tiers, including the future API tier:
  [options-modes.md](./options-modes.md)
