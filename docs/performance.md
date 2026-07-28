# Cartesian render performance

## Goal

Keep a dense cartesian time-series panel — hundreds of series, or hundreds of
thousands of points — inside a usable render budget, without changing how small
charts look. This doc records the levers, the thresholds they trigger at, and
the measurements behind both.

Everything here lives in `src/lib/echarts/options/performance.ts` (resolvers and
thresholds), `src/lib/grafana/editor/common/performance-options.ts` (the editor
fragment) and `src/lib/components/EChart.tsx` (instance-level flags).

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
which is why the 66 committed canvas snapshots did not move when this landed.

## Editor overrides

Three Advanced-tier options (gated behind editor mode — see
[options-modes.md](./options-modes.md)) let a user override the auto behavior on
the cartesian panel:

| Option              | Path                       | Default | Effect                                     |
| ------------------- | -------------------------- | ------- | ------------------------------------------ |
| Show points         | `performance.showPoints`   | `auto`  | `auto` / `always` / `never` → `showSymbol` |
| Downsampling (LTTB) | `performance.downsampling` | `true`  | Turns `sampling` off when unset to false   |
| Animation           | `animation.enabled`        | _unset_ | Explicit value overrides the auto decision |

**Animation deliberately has no `defaultValue`.** Registering one would write a
concrete boolean into the panel JSON on first edit, which `resolveAnimation`
would then treat as an explicit override — permanently disabling the auto path.
Leaving it unset keeps auto reachable until the user actually toggles it.

## What the levers are worth

Measured in headless Chromium against ECharts 6.1.0, rendering into a
1200×600 canvas. Each number is the median of 7 iterations after 2 warmups,
timed from option construction to ECharts' own `finished` event (so animated
runs are not under-counted). Baseline is the pre-branch behavior: inline
`[time, value]` tuples, no fast-path props, animation on.

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
- **The option object is memoized** in `EChart.tsx` (`useMemo` over
  `chartContext` + `isGrafanaLegend`), so incidental re-renders — resize, hover,
  legend interaction — no longer rebuild the whole option and its series arrays.
  This depends on `chartContext` being memoized upstream in `Panel.tsx`.
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
  incidental rather than designed.
