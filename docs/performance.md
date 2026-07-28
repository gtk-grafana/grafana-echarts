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
scenario, each pairing an ECharts panel with its core Grafana (uPlot)
counterpart on the same query. The rows are collapsed because the panels are
deliberately heavy — open one at a time.

## The problem

A Chrome profile of 500 time series showed the initial render as one ~4.5s
main-thread task. The cost was not ingestion — it was scene-graph and raster
work that scales with the number of drawn elements: per-point symbols, transition
diffing, and animation.

That shape is what the levers below target. They are all ECharts features; none
of this is custom rendering.

## The levers

| Lever                   | ECharts option                           | Applies to       | Trigger                             |
| ----------------------- | ---------------------------------------- | ---------------- | ----------------------------------- |
| Hide per-point symbols  | `series.showSymbol`                      | `line`           | > 100 points in the densest series  |
| LTTB downsampling       | `series.sampling: 'lttb'`                | `line`           | > 100 points in the densest series  |
| Batched large-data mode | `series.large` + `series.largeThreshold` | `scatter`, `bar` | ≥ 2000 points in the densest series |
| No animation            | `animation`                              | panel-wide       | always (opt-in to re-enable)        |

Density is measured once per render by `getMaxPointsPerSeries`, over the whole
frame set, so every series in a chart resolves against the same number and a
chart never renders half on the fast path. `effectScatter` (a ripple animation
meant for a handful of highlighted points) and the heatmap cell layer are
deliberately left untouched.

Animation is the exception: it is not density-driven at all. It is simply off,
for every panel family, unless a user opts in. See "Rejected: animation density
thresholds" below for why the threshold version had to go.

The thresholds are chosen so that fixtures below them are visually unchanged —
which is why the existing canvas snapshots did not move when this landed. The
symbol threshold has its own canvas regression test
(`src/lib/components/performance.canvas.test.tsx`), which mocks
`performance/constants` down to a handful of points rather than committing a
100-point snapshot: it pins the behavior at the boundary (markers on at the
threshold, off one point past it, back on under `Show points: Always`) instead of
the constant's current value.

## Editor overrides

Three Advanced-tier options on the cartesian panel (gated behind editor mode —
see [options-modes.md](./options-modes.md)). The first two override the
density-driven auto behavior; the third is a plain opt-in:

| Option              | Path                       | Default | Effect                                     |
| ------------------- | -------------------------- | ------- | ------------------------------------------ |
| Show points         | `performance.showPoints`   | `auto`  | `auto` / `always` / `never` → `showSymbol` |
| Downsampling (LTTB) | `performance.downsampling` | `true`  | Turns `sampling` off when set to false     |
| Animation           | `animation.enabled`        | `false` | Opt in to load/update animation            |

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

| Scenario               | Baseline | With levers | Speedup |
| ---------------------- | -------- | ----------- | ------- |
| 500 series × 100 pts   | 1698 ms  | 375 ms      | 4.5×    |
| 500 series × 1000 pts  | 7383 ms  | 184 ms      | 40×     |
| 20 series × 5000 pts   | 1882 ms  | 35 ms       | 54×     |
| 1 series × 100 000 pts | 1888 ms  | 31 ms       | 61×     |

The 500 × 1000 row reproduces the original profile closely (7.4s ≈ the reported
~4.5s task plus animation tail) and is the case the thresholds were tuned
against.

Note the first row: at exactly 100 points per series the symbol and sampling
levers do **not** engage — that 4.5× is animation alone. Most of the benefit in
the dense rows comes from `showSymbol: false` plus `sampling`, which cut drawn
elements rather than making the same drawing faster.

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
`SeriesStats.seriesCount` all went away with it; `getSeriesStats` collapsed to
`getMaxPointsPerSeries`, which also removed the double stats computation per
render.

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
but saved only 7–55 ms once the levers above were already applied — against a
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
- **Density is computed once per render now**, in the converter only. Dropping the
  animation thresholds removed the second `getSeriesStats` call in
  `panelOption.ts`, and with it the incidental coupling where a large heatmap
  auto-disabled its own animation (its numeric frame columns were being counted
  like series). Both were noted here as warts; both are gone.
- **Cartesian does not normalize its options by editor mode.** Unlike
  part-to-whole, a stored `performance.*` value keeps applying after the user
  switches back to Default. Defaults are the fast path so nothing renders worse,
  but it is inconsistent — see the known gap in
  [options-modes.md](./options-modes.md).
