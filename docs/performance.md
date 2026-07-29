# Cartesian render performance

## Goal

Keep a dense cartesian time-series panel — hundreds of series, or hundreds of
thousands of points — inside a usable render budget, without changing how small
charts look. This doc records the levers, the thresholds they trigger at, and
the measurements behind both.

Everything here lives in `src/lib/echarts/performance/` — `resolvers.ts` (the
resolvers) and `constants.ts` (the thresholds, split out so they can be read and
mocked without pulling in the resolvers) — plus
`src/lib/grafana/editor/common/performance-options.ts` (the editor fragment).
`src/lib/components/EChart.tsx` deliberately passes no perf flags to `init`; see
"Rejected: `useDirtyRect`".

To see it in a real dashboard, use the provisioned **ECharts Performance**
dashboard (`provisioning/dashboards/performance.json`): one collapsed row per
scenario, most pairing an ECharts panel with its core Grafana counterpart on a
byte-identical query (uPlot for the time-series and xychart rows, core `heatmap`
for the last one). One row does not pair: "Symbol threshold" is three ECharts
panels straddling the 100-point total (100, 101, and 4x26=104), with no core
equivalent to compare against.
The rows are collapsed because the panels are deliberately heavy — open one at a
time.

Three things that each broke it: `mapping: 'auto'` (which ignores `series[]`
entirely — it is the _manual_ mapping config), a `byType` y matcher, and giving
the query an `alias` (which renames the value field away from `A-series`, the
default name the matcher targets). Note that the field names are load-bearing, so
this config is coupled to the `random_walk` scenario.

Two things to know when a change to this file doesn't appear in Grafana:
provisioned dashboards poll every 10s by default, and because `default.yaml` sets
no `allowUiUpdates`, Grafana **rejects UI saves** for them — so panel edits made
in the browser live only in that tab's unsaved state and will keep shadowing the
file until the dashboard is reloaded without them.

## The problem

A Chrome profile of 500 time series showed the initial render as one ~4.5s
main-thread task. The cost was not ingestion — it was scene-graph and raster
work that scales with the number of drawn elements: per-point symbols, transition
diffing, and animation.

That shape is what the levers below target. They are all ECharts features; none
of this is custom rendering.

## The levers

| Lever                   | ECharts option                           | Applies to       | Trigger                                 |
| ----------------------- | ---------------------------------------- | ---------------- | --------------------------------------- |
| Hide per-point symbols  | `series.showSymbol`                      | `line`           | > 100 points **in the chart total**     |
| LTTB downsampling       | `series.sampling: 'lttb'`                | `line`           | always armed; **ECharts** gates it (\*) |
| Batched large-data mode | `series.large` + `series.largeThreshold` | `scatter`, `bar` | ≥ 2000 points in the densest series     |
| No animation            | `animation`                              | panel-wide       | always (opt-in to re-enable)            |

(\*) Sampling deliberately carries no threshold of ours. ECharts re-gates it on
the rendered width — its `dataSample` processor thins a series only once
`round(count / axisWidthPx * dpr) > 1`, i.e. at roughly 1.5x more points than the
x axis has pixels. Any per-series count we picked sat far below that and never
fired first, so it read as a behavior boundary that did not exist. It is now armed
on every line series unless the user turns Downsampling off, and ECharts decides
when it engages.

Density is measured once per render, so every series in a chart resolves against
the same numbers and a chart never renders half on the fast path. Each measurement
returns both numbers the table above needs — `totalPoints` and
`maxPointsPerSeries`. Two converters resolve the levers, each measuring its own
series:
`getSeriesDensity(frames)` on the time-axis path (`converters/timeSeries.ts`) and
`getDensityFromSeriesValues` on the category-axis path
(`converters/categoryCartesian.ts`, whose series are flattened already). The
binned heatmap measures only its cartesian overlay subset, since that is what it
passes to the time-series converter. `effectScatter` (a ripple animation meant for
a handful of highlighted points) and the heatmap cell layer are deliberately left
untouched.

**One exception keeps the symbol lever from hiding data.** Markers are the only
thing that renders a series with no line to draw, so `auto` keeps them when a
series holds no two _adjacent_ non-null values — a single-point series (a
Prometheus instant query), or a series whose values are each separated by nulls
(`connectNulls` is off, so a null breaks the path). Without it those charts paint
nothing at all: no marker, and a zero-length path per point covers no pixels. Core
Grafana guards the same case, via the `pointsFilter` its uPlot series builder
applies to gap-isolated points. Two limits worth knowing: a series with even one
contiguous pair takes the fast path, so isolated points _elsewhere_ in it still
lose their markers (`showSymbol` is per-series, and ECharts has no per-point
filter); and the guard belongs to `auto` only — an explicit `never` is obeyed even
when it blanks the series.

Animation is the other exception: it is not density-driven at all. It is off for
every panel family unless a user opts in. See "Rejected: animation density
thresholds" below for why the threshold version had to go. Two series override even
the opt-in and never animate, via a series-level `animation: false` that beats the
panel-level flag: the matrix heatmap's cells (a grid has no shape to grow into, and
the rect count scales with the product of both axes) and the binned heatmap's
cartesian overlay (animating independently of the cells it annotates reads as two
layers disagreeing). The binned layout's own cell series is not covered and still
honors the opt-in — an asymmetry, not a decision.

The thresholds are chosen so that fixtures below them are visually unchanged —
which is why the existing canvas snapshots did not move when this landed. The
symbol threshold has its own canvas regression test
(`src/lib/components/performance.canvas.test.tsx`), which mocks
`performance/constants` down to a handful of points rather than committing a
100-point snapshot: it pins the behavior at the boundary (markers on at the
threshold, off one point past it, back on under `Show points: Always`) instead of
the constant's current value. The no-drawable-line exception is tested in the same
file by counting ink (`arc` and `lineTo` draw calls) rather than snapshotting,
because "did anything render at all" is the whole claim — a snapshot would state it
in a thousand lines and still pass if it were ever re-recorded blank.

## Editor overrides

Three Advanced-tier options on the cartesian panel (gated behind editor mode —
see [options-modes.md](./options-modes.md)). The first two override the
density-driven auto behavior; the third is a plain opt-in:

| Option              | Path                       | Default | Effect                                     |
| ------------------- | -------------------------- | ------- | ------------------------------------------ |
| Show points         | `performance.showPoints`   | `auto`  | `auto` / `always` / `never` → `showSymbol` |
| Downsampling (LTTB) | `performance.downsampling` | `true`  | Turns `sampling` off when set to false     |
| Animation           | `animation.enabled`        | `false` | Opt in to load/update animation            |

Show points and Downsampling apply to both cartesian x-axis paths (time and
category). They do nothing on `boxplot` and `candlestick`, which are the same
panel but a different converter (`converters/multiValueCartesian.ts`) with no
`showSymbol`/`sampling` equivalent — the controls are visible there and inert.
Wiring candlestick's own `large` mode would be the fix; it is not done.

Animation uses the shared `animation.enabled` boolean rather than a
`performance.*` key, because part-to-whole offers the same switch and they should
mean the same thing. Because off _is_ the default, a plain switch is unambiguous:
what it shows is what the chart does.

## What the levers are worth

Measured in headless Chromium against ECharts 6.1.0, rendering into a
1200×600 canvas. Each number is the median of 7 iterations after 2 warmups,
timed from option construction to ECharts' own `finished` event (so animated
runs are not under-counted). Baseline is the pre-branch behavior: inline
`[time, value]` tuples, no fast-path props, animation on.

Reproduce with `pnpm run bench:dataset` (see
[scripts/bench/README.md](../scripts/bench/README.md)). Absolute numbers are
machine-specific; the ratios are what to compare.

| Scenario               | Total pts | Baseline | With levers | Speedup |
| ---------------------- | --------- | -------- | ----------- | ------- |
| 500 series × 100 pts   | 50 000    | 1693 ms  | 44 ms       | 39×     |
| 500 series × 1000 pts  | 500 000   | 7162 ms  | 182 ms      | 39×     |
| 20 series × 5000 pts   | 100 000   | 1829 ms  | 35 ms       | 52×     |
| 1 series × 100 000 pts | 100 000   | 1885 ms  | 31 ms       | 61×     |

The 500 × 1000 row reproduces the original profile closely (7.2s ≈ the reported
~4.5s task plus animation tail) and is the case the thresholds were tuned
against.

Most of the benefit comes from `showSymbol: false`, which cuts drawn elements
rather than making the same drawing faster. The first row is the clearest
evidence: it has only 100 points **per series**, so an earlier per-series symbol
threshold left markers on and that row measured 375 ms instead of 44 ms — an 8.5×
regression hiding behind a threshold that looked like it was doing its job. Total
points is the measure that matters; see the note in `performance/constants.ts`.

## Shipped: feed typed arrays, not tuples

A Chrome heap snapshot + CPU profile of the 500×1000 case (the same shape as the
second bench row) showed where the remaining 3× CPU/memory gap to uPlot lived.
It was not in the levers — it was in how data reached ECharts.

**Memory.** 225.8MB total heap, of which ~126MB was **1,094,182 two-element
`[time, value]` tuple arrays** (~116B each: JSArray header + backing store + two
boxed numbers), built per point by the converter and alive **twice**: once in the
option handed over (retained by the series model and by the `DataStore`'s
provider, which is `persistent: true` for the tuple format), and once in
`OptionManager._optionBackup`, which deep-`clone()`s the whole option on every
`setOption`. ECharts then parsed the tuples into typed `Float64Array` chunks
(24MB) — a third copy, and the only efficient one. The Grafana frames themselves
are ~8–16MB; uPlot stops there.

**CPU.** Per render the panel allocated 500k tuples, ECharts walked them twice
(clone, then parse/fill), and the allocator churned: the 334ms render task
contained 12 minor GCs and one major GC (~30ms), with ~65ms of GC across the ~3s
profile window. Parse/fill (`t.addData`, `_initDataFromProvider`) was ~100ms. (A
separate one-time cost is ~0.6s of bundle evaluation on page load — module init,
not data. Per-family registration in `src/lib/echarts/echarts.ts` is a possible
follow-up, not part of this work.)

**The fix.** `timeSeriesToEChartsOption` now emits one flat interleaved
`Float64Array` per series (`[t0, v0, t1, v1, …]`, `NaN` for missing values —
epoch-millisecond timestamps rule out `Float32`) with `dimensions: ['time',
'value']` declared — ECharts' `SOURCE_FORMAT_TYPED_ARRAY` path
(`toInterleavedData` in `converters/timeSeries.ts`). Three properties make it a
strict win over tuples:

- The typed-array provider is `pure: true, persistent: false` — `DataStore`
  fills its chunks in one tight numeric loop and **drops the source reference**,
  so ECharts does not retain our array.
- zrender's `clone()` copies a typed array with `Ctor.from` — a ~8MB memcpy
  instead of deep-cloning 500k tuple arrays. The `_optionBackup` copy shrinks
  ~7×.
- The converter's per-point `map` became one flat fill loop per series — 500
  allocations instead of 500,000, which removes the GC churn.

Sampling, symbol resolution, stacking, and the tooltip seam are unaffected: they
read the `DataStore` or the Grafana frames, never the source format.

**Measured** (`pnpm run bench:dataset`, perf levers on — the configuration the
panel ships; same-run medians, same machine as the table above):

| Scenario               | tuples finish / heap | typed-array finish / heap | CPU delta | Heap delta |
| ---------------------- | -------------------- | ------------------------- | --------- | ---------- |
| 500 × 100 (500 frames) | 45.2ms / 6.2MB       | 32.3ms / 5.9MB            | −29%      | −5%        |
| 500 × 100 (wide frame) | 43.9ms / 6.2MB       | 32.2ms / 5.8MB            | −27%      | −6%        |
| 500 × 1000             | 191.8ms / 39.6MB     | 87.1ms / 4.8MB            | −55%      | −88%       |
| 20 × 5000              | 34.6ms / 10.4MB      | 11.0ms / 2.1MB            | −68%      | −80%       |
| 1 × 100k               | 29.9ms / 5.9MB       | 5.0ms / 4.8MB             | −83%      | −19%       |

Every scenario's canvas hash is **identical** between tuples and typed arrays —
same pixels, less work. Typed arrays also beat the `dataset` path head-to-head
(87.1 vs 128.4ms at 500×1000; 5.0 vs 14.2ms at 1×100k), which confirms the
dataset rejection a second time. The canvas draw-call snapshots
(`src/lib/components/performance.canvas.test.tsx`, which includes a
null-separated series) pin gap-rendering parity: `NaN` in a typed array breaks
line segments exactly like tuple-form `null`.

**Scoped out.** The category-axis converter (`categoryCartesian.ts`) and the
binned heatmap's `type: undefined` hover-overlay series keep tuples: the former
is a different x-axis model, the latter is small and untyped. Both are
revisit-able later. `setAsPrimitive` (zrender's `clone()` escape hatch) on the
data arrays would eliminate the remaining 8MB backup clone; deferred — it makes
the backup alias live data, which wants explicit testing around legend toggles
and stack recomputation. See "Rejected: feeding ECharts through `dataset`" for
the columnar alternative that measured worse.

## Rejected: animation density thresholds

Animation was originally auto-disabled above 50 series or 5000 points/series,
keeping it for small charts. That shipped and was removed: **the threshold fires
correctly, just too late to help.**

Verified by driving successive `setOption` calls and comparing the first painted
frame against the settled one:

| render                       | series | `animation` | animated? |
| ---------------------------- | ------ | ----------- | --------- |
| first response               | 10     | `true`      | yes       |
| dense response               | 60     | `false`     | **no**    |
| control, same jump           | 60     | `true`      | yes       |
| growth still under threshold | 30     | `true`      | **yes**   |

The dense render behaves exactly as designed. The problem is everything leading
up to it:

- **A panel cannot know a response is dense until it has it.** By the time the
  count is known, that render is already correct — but the render _before_ it
  animated on the old, smaller count.
- **Grafana re-renders with the previous data while a query is in flight**, so
  that intermediate render animates too.
- **Any threshold leaves a band below it.** Growing 10 → 40 series stays under 50
  and animates, and 40 series is already heavy enough to feel.

Raising or lowering the threshold just moves the band. Suppressing animation
whenever the series set changes shape would need per-instance history in
`EChart.tsx`, and would end up disabling animation on virtually every real data
refresh anyway — converging on "off" with extra machinery.

So animation is opt-in, off by default, for every family including the pie. That
is also **closer to core Grafana**, whose viz panels do not animate at all — so
this is parity rather than a regression, which is worth more here than an
animation nobody asked for. `ANIMATION_MAX_SERIES`, `ANIMATION_MAX_POINTS` and
`SeriesStats.seriesCount` all went away with it, as did the second stats
computation per render — the surviving density helper is `getSeriesDensity`, which
returns both `totalPoints` and `maxPointsPerSeries` and is called once, in the
converter.

## Rejected: `useDirtyRect`

`init(dom, undefined, { useDirtyRect: true })` repaints only changed regions
instead of the whole canvas. It shipped on this branch and was reverted: it
corrupts the initial draw, and it does not measurably help.

**The bug.** On mount, `EChart.tsx` runs the option effect and then the resize
effect, so `chart.resize()` lands while the load animation is still running. With
dirty rect on, the region the resize exposes is left partly unpainted — zrender's
dirty regions were computed against the pre-resize layout. It was first reported
in Grafana as gridline gaps (blank rectangles where gridlines belong); the
committed repro loses the line paths while the point markers survive. Which
elements go missing depends on what is animating, so the symptom is not a
reliable signature. Setting animation off makes it disappear, which is what
pinned the trigger.

**The non-benefit.** Timed on and off across initial render, full-option updates
and hover highlight, the difference sits inside run-to-run variance and does not
hold a consistent sign — the 500-series case measured both +0.4% and −5.7% on
initial render across two runs. That is the expected result: `setOption` runs with
`notMerge: true`, so every update replaces the whole option, every repaint
invalidates everything, and there is no partial repaint left to skip. Dirty rect
pays off for incremental updates, which this render loop does not do.

So it was a correctness regression bought with no reliable gain. Reproduce both
halves with `pnpm run bench:dirty-rect` before proposing it again.

Gating it on "animation is off" was considered and rejected: `useDirtyRect` is an
`init()` option, and the animation decision is data-dependent, so honoring it
would mean disposing and re-initializing the instance whenever a chart crossed a
density threshold — losing brush state and flashing — to buy an effect that
measures as noise.

## Rejected: feeding ECharts through `dataset`

A columnar `option.dataset` + per-series `encode` path was prototyped on this
branch and removed after measurement. It is pixel-identical to the tuple path
but saved only 1–55 ms once the levers above were already applied — against a
permanent second data path and a silent multi-series tooltip bug. Full rationale
and numbers: [dataset.md](./dataset.md).

## Notes and open questions

- **`useDirtyRect` is deliberately off** — see "Rejected: `useDirtyRect`" above.
  Do not re-add it without running `pnpm run bench:dirty-rect`.
- **The option build is not separately memoized, deliberately.** A `useMemo` over
  `chartContext` + `isGrafanaLegend` was tried and removed: the build already sits
  in a `useEffect` keyed on the same memoized `chartContext` (see `Panel.tsx`), so
  it already skipped incidental re-renders — resize, hover, legend interaction.
  The memo changed nothing except moving the build onto the render path, which
  delays paint on dense charts.
- **`setOption` still runs with `notMerge: true`**, replacing the option
  outright on every change. That is required because the panel switches across
  chart families with different component structures. It also means the
  "swap data without rebuilding config" optimization is unavailable; capturing it
  would mean moving to `replaceMerge`, a separate and larger change.
- **`sampling: 'lttb'` has not been compared against `'minmax'`.** LTTB
  preserves visual shape; `minmax` preserves extremes, which can matter more for
  spiky monitoring data. Worth revisiting (there is a `@todo` at the call site).
- **Stacked line/area charts under LTTB have a fidelity wart, not a correctness
  bug.** Stack values are computed before sampling — ECharts runs `dataStack` at
  processor priority 900 and `dataSample` at 5000 — so the stacked totals at every
  retained point are right. But each series is sampled independently, and against
  the _raw_ value dimension rather than the stacked one, so bands in a dense stack
  can keep mismatched x positions and the retained points are not chosen from the
  geometry actually drawn. Only bites above the pixel-width gate. Untested.
- **Density is computed once per render per converter.** Dropping the animation
  thresholds removed the second stats call in `panelOption.ts`, and with it the
  incidental coupling where a large heatmap auto-disabled its own animation (its
  numeric frame columns were being counted like series). Both were noted here as
  warts; both are gone.
- **Point markers can still disappear _within_ a series.** The no-drawable-line
  exception above saves a series that would render as nothing, but a series holding
  one contiguous pair plus many gap-isolated points takes the fast path and loses
  the markers on those isolated points. `showSymbol` is per-series, and ECharts
  offers no per-point equivalent of core Grafana's `pointsFilter`, so closing this
  fully would mean splitting a series in two or drawing a companion scatter series.
- **Cartesian does not normalize its options by editor mode.** Unlike
  part-to-whole, a stored `performance.*` value keeps applying after the user
  switches back to Default. Defaults are the fast path so nothing renders worse,
  but it is inconsistent — see the known gap in
  [options-modes.md](./options-modes.md).
