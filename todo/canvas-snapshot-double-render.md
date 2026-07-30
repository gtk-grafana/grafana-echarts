# Canvas snapshots record two render passes

## Problem

Every `toMatchCanvasSnapshot` baseline captures **two full render passes**, not one.
Usually the two agree exactly and the duplication is invisible — but in the themeRiver
suite they **diverge**, so that baseline pins an intermediate, pre-layout-settle render
as well as the finished one. A change that only moves the first pass then flips the
snapshot even when the final pixels are identical.

Found while rendering payloads to images for review (see
[scripts/canvas-shots.mjs](../scripts/canvas-shots.mjs)); not yet investigated.

## Evidence

`.jest-canvas-mock-compare/jest-canvas-compare-stream_themeRiver_canvas_snapshots_layer_labels_labels_on.json`
(3 ribbons, 3 labels) records, in its asserted `actual` events:

- 6 `beginPath`/`fill` and 36 `bezierCurveTo` — 3 ribbons drawn **twice**
- 6 `fillText` — each label drawn twice
- 8 `setTransform`, in two groups of `{ e: 0, f: 30.8 }` + three label translates:
  `f: 49.04 / 80.31 / 153.27`, then `f: 53.04 / 91.17 / 180.13`
- the two passes' path geometry differs from the first point on: `y: 7.817143` vs
  `y: 9.531429`

The replayed image shows this directly: each layer label appears twice, a few pixels
apart. The ribbons look single because the opaque second pass covers the first.

**Contrast — the same doubling, but benign.**
`jest-canvas-compare-part-to-whole_canvas_renders_type_donut_inner_hole.json` also
records two passes (6 `fill` for 3 slices, 6 `fillText` for 3 labels, 2 `save`), yet its
two passes are byte-identical across all 24 drawing calls, so nothing is visible and the
baseline is stable. So the bug is not "two passes" but "the second pass lays out
differently" — whatever themeRiver does that pie does not.

## Why it matters

- **Baseline fragility** (themeRiver today; any suite whose passes start diverging
  tomorrow) — the snapshot asserts on a transient layout. Anything that changes when or
  how the first pass runs (container measurement, `ResizeObserver` mock timing, an added
  `await`) rewrites the baseline for no visible reason.
- **Noise in review** — doubled labels in the replayed image look like a label bug, so
  every future reader has to re-derive that they are two passes.
- Hypothesis (unverified): the plot area changes height between the passes. The label
  translates move _down_ by 4 / 11 / 27 px in the second pass, which is what a slightly
  shorter chart box would do. `jest-setup.js` gives jsdom a synchronous `ResizeObserver`
  that reports the inline-style-derived client size or falls back to 240x40, so
  `VizLayout`'s legend measurement — and with it the chart's available height — can land
  on a different value after the first paint.

## Options

- **A** — let the layout settle before recording: have the canvas test helper wait for
  the resize-driven re-render, then reset the recorded events so only the final pass is
  asserted. Smallest surface, keeps snapshots readable; needs a reliable "settled"
  signal.
- **B** — drop the mocked `ResizeObserver` size for canvas tests and size the container
  explicitly, so only one pass ever runs.
- **C** — accept two passes and assert only the last one, filtering by the
  `save`/`setTransform(e: 0)` boundary in the matcher's payload.

## Notes

Whichever way this goes, every `*.canvas.test.*` baseline is rewritten — so it wants to
be a deliberate, standalone change, not a side effect of feature work. Do not touch the
snapshots as part of another task (see AGENTS.md).
