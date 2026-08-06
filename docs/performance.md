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

## Suggestion previews

The one part of this document that is not cartesian-specific. Grafana renders every
Visualization Suggestion card as a **real panel** at 350×219
(`VisualizationSuggestionCard`), so each card is a full converter run plus an
ECharts canvas paint. Roughly twenty cards are possible across the seven nested
panels, and a given response typically matches two or three families — but before
this was bounded, opening the Suggestions pane over a 500-series query meant ten
full panel renders back to back on the main thread, with the DOM legend on, point
symbols on, and no downsampling.

Previews are capped with Grafana's own `cardOptions` mechanism rather than anything
bespoke, because it applies to a `cloneDeep` of the suggestion — so **preview-only
degradation never leaks into the panel the user creates from the card.**

| Mechanism         | What Grafana does with it                        | This plugin's value                                                                                 |
| ----------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `maxSeries`       | `data.series.slice(0, n)`                        | `PREVIEW_MAX_SERIES` (20), every card                                                               |
| `maxRows`         | truncates each field's `values` to the first `n` | `PREVIEW_MAX_ROWS` (500) cartesian/stream; `MULTIVARIATE_PREVIEW_MAX_ROWS` (25) radar/parallel      |
| `previewModifier` | runs against a `cloneDeep` of the suggestion     | hides the legend, forces `showPoints: 'never'` + `downsampling: true`, suppresses per-family labels |

Why those degradations specifically:

- **Legend off.** The Grafana `VizLegend` is React DOM, one row per series, and is
  illegible at card scale regardless. Core Grafana makes the same trade via its
  `SUGGESTIONS_LEGEND_OPTIONS`.
- **`performance` forced.** Exactly the two levers above, pinned rather than left to
  the density heuristic — a card is 350px wide, so there is no point at which point
  markers help.
- **Labels off per family.** `displayLabels: []` (pie/funnel) and
  `relationsShowNodeLabels: false`. Text layout dominates in those families and none
  of it is readable at 350×219. The stream family needs no override: its layer labels
  already default to off.

Two constraints on anything added to the modifier later:

1. **It must not be in an `ADVANCED_*_DEFAULTS` set.** In Default editor mode
   `applyEditorModeDefaults` spreads those over the stored options before the chart
   is built, which would silently undo the modifier. `legend` and `performance` were
   checked; `animation` is in `ADVANCED_CARTESIAN_DEFAULTS`, which is one of two
   reasons it is not set here (the other being that it already defaults off).
2. **It must tolerate `options === undefined`.** Cards are built by hand here, so
   several carry no options object at all — core's own modifiers assign into
   `s.options!.legend` and only get away with it because they always run after a
   `defaultsDeep`.

The gates in `charts/fitness.ts` are the other half of this. They bound what is
_offered_, so a shape that cannot be drawn legibly never becomes a card in the first
place: 50 radar axes, 30 pie slices, 20 stream layers, 500 relations edges. Both the
caps and the gates live in `charts/suggestionLimits.ts`, kept free of imports so a
test can mock it and cross a limit with a handful of rows.

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
