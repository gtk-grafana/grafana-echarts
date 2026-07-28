# Render benchmarks

Manual benchmarks for the ECharts render path. **Not wired into CI** — they need a
real browser, take a few minutes, and their absolute numbers are machine-specific.
Run them when you are changing how data reaches ECharts, or re-litigating one of
the decisions in [docs/performance.md](../../docs/performance.md) or
[docs/dataset.md](../../docs/dataset.md).

They drive a real Chromium (via the `@playwright/test` browser already installed
for e2e) against the exact `echarts` version this repo depends on — the dist
bundle is injected from `node_modules`, not vendored, so it cannot drift.

```sh
pnpm run bench:dataset          # tuples vs dataset, and what the perf levers are worth
pnpm run bench:dataset-tooltip  # what params.value contains under a dataset
pnpm run bench:dirty-rect       # why useDirtyRect is off: the artifact + the non-benefit
```

## `bench:dataset`

Compares four variants across five data shapes: inline `[time, value]` tuples vs
a columnar `option.dataset` + `encode`, each with and without the performance
levers. Human-readable log on stderr, JSON on stdout:

```sh
pnpm run bench:dataset > results.json
```

Four properties make it trustworthy. Preserve them if you change it:

1. **The performance levers are held identical on both sides of a pair.** They
   are worth 40–61×; the data path is worth single-digit percent. Vary both at
   once and you measure the levers.
2. **Timing runs to ECharts' `finished` event**, not to `setOption` returning.
   With animation on, most of the work happens after `setOption` returns.
3. **The canvas is hashed and compared** across the two data paths. A variant
   that silently renders less would otherwise look faster.
4. **Frames are generated once per scenario** and shared by every variant, so no
   measurement includes data generation.

The scenario list includes both a wide frame (many value fields, one time column)
and many single-field frames. They behave differently, and the wide case is
simultaneously the dataset's best theoretical case and the one whose tooltips it
breaks.

## `bench:dataset-tooltip`

Not a benchmark — a correctness probe, kept because it is the decisive argument
in `docs/dataset.md` and the kind of claim that is easy to reason about wrongly.
It drives a real axis-triggered tooltip on a real instance and prints what each
series' `params.value` contains under both data paths. Under `dataset` on a wide
frame, every series resolves to the last value column.

The repo's existing tooltip tests construct their `params` object by hand, so
they cannot catch this. If dataset is ever revisited, an instance-driven tooltip
test in `src/` is a prerequisite rather than a follow-up.

## `bench:dirty-rect`

Why `useDirtyRect` is off. Two parts: it reproduces the initial-draw corruption
(init small → `setOption` with animation on → `resize()` mid-animation, which is
the mount sequence `EChart.tsx` produces) and writes PNGs to compare, then times
the flag on and off across initial render, full-option updates and hover.

The artifact only appears with animation enabled. The timing sits inside
run-to-run variance without a stable sign, because `setOption` runs with
`notMerge: true` — every repaint invalidates everything, so there is no partial
repaint for dirty rect to skip.

Run this before proposing the flag again. Rationale:
[docs/performance.md](../../docs/performance.md).

## Files

| File                        | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `bench.html`                | The page: frame generation, both option builders, the timing harness |
| `dataset-vs-tuples.mjs`     | Driver for the timing comparison                                     |
| `dataset-tooltip-probe.mjs` | Driver for the `params.value` probe                                  |
| `dirty-rect.mjs`            | Self-contained: `useDirtyRect` artifact repro + timing               |

`bench.html` builds the option shapes by hand rather than importing the plugin's
converter, so it has no build step. That is a deliberate trade: it measures the
ECharts boundary precisely, and the shapes are small enough to keep in sync by
eye. If the converter's output shape changes materially, update the builders.
