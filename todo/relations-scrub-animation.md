# The time slider's step animates on chord, cuts on sankey and graph

## Problem

Stepping the relations [time slider](../src/lib/components/ChartTimeSlider.tsx) redraws
correctly on all three render variants, but only **chord** morphs between states. **Sankey**
and **graph** cut straight to the new frame.

That is the wrong way round: the sankey's _geometry_ is the value (ribbon thickness is the
weight), so it is where a tween would carry the most information. A graph's links do not
encode their weight at all, so for `graph` the honest answer is "nothing moves because
nothing is value-driven", not "the animation is broken".

## Cause: `SankeyView` has no update animation at all

Upstream, in ECharts 6.1.0, and not reachable from a panel option.

| Variant  | View                                                           | On a data update                                                                                        |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `chord`  | `lib/chart/chord/ChordView.js`                                 | `data.diff(oldData)` with an `update` branch calling `el.updateData(...)` — **tweens**                  |
| `sankey` | `lib/chart/sankey/SankeyView.js`                               | no diff; `curve.setShape({...})` / `rect.setShape(...)` written straight onto the element — **cuts**    |
| `graph`  | `lib/chart/graph/GraphView.js` (via `SymbolDraw` / `LineDraw`) | diffs and tweens, but only `symbolSize` and position — neither is value-driven here — **nothing moves** |

`SankeyView`'s _only_ animation is a left-to-right clip wipe on first render
(`createGridClipShape`), gated on `!this._data`. Once `_data` is set, every later render
sets shapes imperatively.

## Three fixes that do not work

Ruled out by sampling canvas ink every 50ms across one step and counting distinct values (a
tween shows ~10, a cut shows 2). Chord read 10 in every configuration below, sankey 2.

1. **`setOption` without `notMerge`.** ECharts matches views by series id, so `SankeyView`
   and its `_data` survive a `notMerge` — and chord already tweened across one. Merging only
   on a scrub changed neither variant's numbers.
2. **`series.sankey.universalTransition: { enabled: true }`.** Inert, and still inert after
   registering the `UniversalTransition` feature — universal transition morphs between
   _different_ series, not within one.
3. **Forcing the first-render wipe per step** (`chart.clear()`, or a new series id so the
   view is recreated) would replay `createGridClipShape`. The wrong effect even if it works:
   a left-to-right wipe every step reads as the panel reloading, and discards pan/zoom.

## One symptom of the same rebuild is fixed

The same rebuild made each edge **label** a new object every pass, so
`LabelManager._animateLabels` took its `if (!oldLayout)` branch and faded every edge value in
from zero — `0.001 → 1` over ~120 frames per step, timed by `animationDuration` rather than
the update duration. A `graph` never showed it, for the same reason it has no shape tween to
lose.

That one is fixable panel-side: `registerEdgeLabelFadeIn` sets zrender's
`disableLabelAnimation` on every edge-label host. The shapes still cut.

## What would actually fix it

An upstream change to `SankeyView.render` — diff against `this._data` and route node rects
and link curves through `graphic.updateProps` instead of `setShape`, which is what
`ChordView` already does. Worth an ECharts issue; there is no panel-side workaround that is
better than the cut.

Until then it is documented rather than worked around:
`provisioning/dashboards/relations/timeline.json` carries a chord panel beside the sankey so
the difference is visible, and `src/modules/relations/parity.md` says which variant morphs.
