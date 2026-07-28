# Cartesian render performance

## Goal

Keep a dense cartesian time-series panel — hundreds of series, or hundreds of
thousands of points — inside a usable render budget, without changing how small
charts look. This doc records the levers, the thresholds they trigger at, and
the measurements behind both.

Everything here lives in `src/lib/echarts/performance/` —
`resolvers.ts` (the resolvers) and `constants.ts` (the thresholds, split out so
they can be read and mocked without pulling in the resolvers) — plus
`src/lib/grafana/editor/common/performance-options.ts` (the editor fragment) and
`src/lib/components/EChart.tsx` (instance-level flags).

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

| Lever                   | ECharts option                           | Applies to       | Auto-trigger                            |
| ----------------------- | ---------------------------------------- | ---------------- | --------------------------------------- |
| Hide per-point symbols  | `series.showSymbol`                      | `line`           | > 100 points in the densest series      |
| LTTB downsampling       | `series.sampling: 'lttb'`                | `line`           | > 100 points in the densest series      |
| Batched large-data mode | `series.large` + `series.largeThreshold` | `scatter`, `bar` | ≥ 2000 points in the densest series     |
| Disable animation       | `animation`                              | panel-wide       | > 50 series **or** > 5000 points/series |
| Dirty-rectangle repaint | `init(..., { useDirtyRect: true })`      | every chart      | always on                               |

Density is measured once per render by `getSeriesStats`, over the whole frame
set, so every series in a chart resolves against the same numbers and a chart
never renders half on the fast path. `effectScatter` (a ripple animation meant
for a handful of highlighted points) and the heatmap cell layer are deliberately
left untouched.

The thresholds are chosen so that fixtures below them are visually unchanged —
which is why the existing canvas snapshots did not move when this landed. The
symbol threshold has its own canvas regression test
(`src/lib/components/performance.canvas.test.tsx`), which mocks
`performance/constants` down to a handful of points rather than committing a
100-point snapshot: it pins the behavior at the boundary (markers on at the
threshold, off one point past it, back on under `Show points: Always`) instead of
the constant's current value.

## Editor overrides

Three Advanced-tier options (gated behind editor mode — see
[options-modes.md](./options-modes.md)) let a user override the auto behavior on
the cartesian panel:

| Option              | Path                       | Default | Effect                                     |
| ------------------- | -------------------------- | ------- | ------------------------------------------ |
| Show points         | `performance.showPoints`   | `auto`  | `auto` / `always` / `never` → `showSymbol` |
| Downsampling (LTTB) | `performance.downsampling` | `true`  | Turns `sampling` off when set to false     |
| Animation           | `performance.animation`    | `auto`  | `auto` / `always` / `never` → `animation`  |

**Animation is a tri-state, not a switch.** It was a boolean switch first, with
no `defaultValue` so that the unset state could mean "auto" — but the editor
renders the stored value, so the switch showed _off_ while a small chart was in
fact animating. A tri-state makes `auto` representable: it persists harmlessly
and keeps the threshold-driven path reachable. Both tri-states share one
`PerformanceMode` type and one option list, so the two radios read identically.

The shared `animation.enabled` boolean still exists and is still honored (it is
what part-to-whole writes, and where a hand-edited or previously-persisted JSON
value lands), but it now ranks _below_ the tri-state — see `resolveAnimation`.

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

## Rejected: feeding ECharts through `dataset`

A columnar `option.dataset` + per-series `encode` path was prototyped on this
branch and removed after measurement. It is pixel-identical to the tuple path
but saved only 7–55 ms once the levers above were already applied — against a
permanent second data path and a silent multi-series tooltip bug. Full rationale
and numbers: [dataset.md](./dataset.md).

## Notes and open questions

- **`useDirtyRect` is on for every chart**, not just cartesian. It repaints only
  changed regions. The known trade-off is a rare repaint artifact on charts with
  heavily overlapping graphics; cartesian is low-risk and it is a single-flag
  revert in `EChart.tsx` if one shows up.
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
- **Animation stats are computed panel-wide**, including for the heatmap: its
  frames carry numeric fields that `forEachTimeSeriesField` counts as series, so
  a large enough heatmap auto-disables animation too. That is harmless but
  incidental rather than designed. The last row of the provisioned performance
  dashboard exercises it (64 series, past `ANIMATION_MAX_SERIES`).
- **`getSeriesStats` runs twice per cartesian render** — once in `panelOption.ts`
  for the animation flag and once in the converter for the series props. It is
  O(fields) with an O(1) length read per field, so this is cheap, but it is
  redundant.
- **Cartesian does not normalize its options by editor mode.** Unlike
  part-to-whole, a stored `performance.*` value keeps applying after the user
  switches back to Default. Defaults are the fast path so nothing renders worse,
  but it is inconsistent — see the known gap in
  [options-modes.md](./options-modes.md).
