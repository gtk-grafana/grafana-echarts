# ECharts `dataset`

## Outcome

**Prototyped, measured, removed.** A columnar `option.dataset` + per-series
`encode` path for the time-series converter was implemented on
`gtk-grafana/performance-options`, benchmarked against the inline-tuple path it
replaced, and reverted. The performance defaults it shipped alongside were kept
— those are the levers that actually move the number (see
[performance.md](./performance.md)).

This doc records why, so the question doesn't get re-litigated from scratch.

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

For the per-series-type question of _which_ ECharts series can see a dataset at
all, see [data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md) —
that split was verified against the 6.1.0 source and is not repeated here.

## What was measured

Headless Chromium, ECharts 6.1.0, 1200×600 canvas. Median of 7 iterations after
2 warmups, timed from option construction to ECharts' `finished` event. The two
data paths were compared **with the performance levers held identical on both
sides**, so the delta is the dataset change alone and nothing else.

A screenshot hash comparison confirmed the two paths render **pixel-identical
output** in every scenario, so this is a like-for-like comparison.

| Scenario                  | Tuples | Dataset | Delta            |
| ------------------------- | ------ | ------- | ---------------- |
| 500 series × 100 pts      | 375 ms | 368 ms  | −7 ms (−1.8%)    |
| 500 series × 100 pts wide | 372 ms | 386 ms  | **+15 ms (+4%)** |
| 500 series × 1000 pts     | 184 ms | 128 ms  | −55 ms (−30%)    |
| 20 series × 5000 pts      | 35 ms  | 20 ms   | −16 ms (−44%)    |
| 1 series × 100 000 pts    | 31 ms  | 16 ms   | −15 ms (−49%)    |

The converter-side saving is real and behaves exactly as predicted: at 500 × 1000
the option build drops from 11.6 ms / 23.4 MB allocated to 0.2 ms / ~0 MB,
because the columns are passed by reference instead of being copied into
per-point tuples.

Repeating the comparison with the performance levers **off** (animation on, the
old defaults) gives deltas of −0.2% to −2.8% — indistinguishable from noise. The
tuple allocation only becomes visible once the far larger render costs are gone.

## Why those numbers don't justify it

The percentages in the dense rows look substantial, and they are honest. What
makes them not worth it is the denominator.

The performance levers alone take the 500 × 1000 case from **7383 ms to 184 ms**.
Dataset then takes it from 184 ms to 128 ms. So of the ~7.25 s originally on the
table, the levers recover 7.20 s and dataset recovers a further 0.06 s — under
1% of the problem, for the larger share of the complexity.

In absolute terms the saving is 15–55 ms, below a frame budget in four of five
scenarios. And in the wide-frame case — 500 series sharing one time column,
supposedly dataset's best case, the one where the shared column is parsed once
instead of 500 times — it measured **slower**.

The doc's original theory was that dataset addresses "roughly half the measured
problem." The measurement says it is closer to 1%.

## The failure mode, confirmed

The sharpest risk in the original analysis was that `params.value` silently
becomes the whole dataset row. That was verified empirically against a real
ECharts instance, not reasoned about: a wide frame with three series holding
constant 10 / 20 / 30, axis-triggered tooltip, reading the value exactly as
`unwrapTooltipValue` (`src/lib/echarts/tooltip/template.ts`) does.

```
tuples    A -> 10  OK      params.value=[t,10]        dims=["x","y"]
          B -> 20  OK      params.value=[t,20]
          C -> 30  OK      params.value=[t,30]

dataset   A -> 30  WRONG   params.value=[t,10,20,30]  dims=["time","v0","v1","v2"]
          B -> 30  WRONG   params.value=[t,10,20,30]
          C -> 30  OK      params.value=[t,10,20,30]
```

Under a keyed-columns source ECharts assembles each raw item across _every_
declared dimension (`rawSourceItemGetterMap[SOURCE_FORMAT_KEYED_COLUMNS]` in
`lib/data/helper/dataProvider.js`), and `getDataParams` passes that whole row
through. `unwrapTooltipValue` takes the last element, so every series reports the
last value column.

Note the profile: a frame with one value field yields `[time, v0]`, whose last
element is correct, and the last series of any frame is accidentally correct.
**Single-series charts work; multi-series charts break.** A prototype tested on
simple fixtures looks fine — and the ~35 committed tooltip assertions construct
their `params` object by hand, so they keep passing while real tooltips lie.

Grafana's wide time-series format is exactly the multi-value-fields-per-frame
shape that breaks. This was not an edge case.

Fixing it properly means routing all six tooltip builders through
`params.encode.y[0]` and `params.dimensionNames`, plus an instance-driven tooltip
test to stop it regressing. That work is the actual price of dataset, and it buys
the 15–55 ms above.

## The rest of the cost

Beyond the tooltip, these were the standing objections. They remain valid and are
the reason the answer is unlikely to change on a re-measurement alone.

**It ends with two data paths, permanently.** `treemap` and `sunburst` read
`option.data` directly and can never see a dataset. The binned heatmap computes
cell rectangles rather than passing columns through. So this is not a migration
that converges on one path.

**Per-item styling cannot live in a dataset.** Pie, funnel and radar emit
`{ name, value, itemStyle, label, emphasis }` objects. A dataset carries values,
not styles. This inverts the cost/benefit: the families where a dataset saves the
least — they handle tens of items, not thousands — are the ones where adopting it
costs the most.

**Positional coupling must be preserved deliberately.** Tooltip resolution
(`indexedFormatterResolver`), y-axis assignment and threshold attachment to
`series[0]` are all positional and depend on series being emitted one-per-field
in converter order. Letting ECharts auto-generate series from dataset dimensions
would break all three at once.

**Hardcoded dimension indices.** `HEATMAP_VALUE_DIM = 4` and
`MATRIX_VALUE_DIM = 2` drive both `visualMap.dimension` and tooltip tuple
indexing. Re-dimensioning silently breaks heatmap color mapping.

**`stripHiddenValueFields` shifts columns.** It drops hidden numeric fields
upstream in `src/lib/grafana/fields/fieldConfig.ts`, moving dimension positions.
Naming dimensions avoids this; indexing them reintroduces off-by-one bugs.

**Bundle cost.** `DatasetComponent` has to be registered, landing in the shared
async chunk that the webpack `splitChunks` cache group and CI bundle-stats
workflow exist to watch.

## What would still be worth having

These were the genuine non-performance arguments, and removing the prototype does
not refute them. If dataset returns, it should be for one of these — with the
tooltip work costed in from the start, not as a follow-up.

- **Data links.** Under a dataset a row index _is_ a frame row index. There is no
  `dataIndex` → frame-row infrastructure today and no click handling at all;
  this is what would make data links implementable.
- **The API editor tier.** `docs/options-modes.md` describes a future
  raw-ECharts tier. A user writing ECharts config by hand expects `encode`
  against named dimensions, not opaque pre-baked arrays.
- **Declarative candlestick reordering.** ECharts wants OCLH, datasources emit
  OHLC, and `converters/multiValueCartesian.ts` reorders by hand.
  `encode: { x: 0, y: [1, 4, 3, 2] }` expresses it directly.
- **Legend metadata.** `buildMultiValueCartesianLegendItems` re-runs the whole
  converter just to read each series' `name` and `itemStyle.color`.

The natural scope, if it happens, is still the time-series cartesian path and
nothing else — pie, funnel, radar and hierarchy stay on hand-built data as a
deliberate boundary.

## Reproducing the measurement

Both the timing comparison and the tooltip probe are committed, so this does not
have to be taken on trust:

```sh
pnpm run bench:dataset          # the table above
pnpm run bench:dataset-tooltip  # the WRONG/OK output above
```

They are manual — not wired into CI — and live in
[scripts/bench/](../scripts/bench/README.md), which documents the four properties
that make the timing trustworthy (levers held identical across a pair, timing to
`finished`, canvas hashing, frames generated once). Absolute numbers are
machine-specific; compare ratios.

The dataset option builder is still in the harness even though the production
path is gone — that is the point. It is what makes the comparison re-runnable
against a future ECharts version without first re-implementing the prototype.

## References

- Dataset concept and `seriesLayoutBy` limitation:
  https://echarts.apache.org/handbook/en/concepts/dataset/
- Data transforms (`filter`, `sort`, external transforms):
  https://echarts.apache.org/handbook/en/concepts/data-transform/
- Which series are dataset-aware in 6.1.0:
  [data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md)
- The levers that were kept: [performance.md](./performance.md)
- Editor tiers, including the future API tier:
  [options-modes.md](./options-modes.md)
