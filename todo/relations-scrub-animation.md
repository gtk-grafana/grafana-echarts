# The time slider's step animates on chord, cuts on sankey and graph

## Problem

Stepping the relations [time slider](../src/lib/components/ChartTimeSlider.tsx) — dragging
it, arrow-keying it or clicking a step button — redraws the chart correctly on all three
render variants, but only **chord** morphs between the two states. **Sankey** and **graph** cut straight to the
new frame.

That is the wrong way round for legibility: the sankey is the variant whose _geometry_ is
the value (ribbon thickness is the weight), so it is the one where a tween would carry the
most information. A graph's links do not encode their weight in the first place, so there
is visibly nothing to animate there — the honest answer for `graph` is "nothing moves
because nothing is value-driven", not "the animation is broken".

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

## Three fixes that do not work, each ruled out by measurement

Measured on `provisioning/dashboards/relations/timeline.json` at :4001, by sampling canvas
ink every 50ms across one step and counting distinct values (a tween shows ~10, a cut shows
2). Chord read 10 in every configuration below; sankey read 2 in every one.

1. **`setOption` without `notMerge`.** The obvious suspect — `useChartOption` pushes
   `{ notMerge: true }`, which reads like it should discard the previous series model and
   leave nothing to animate from. It does not: ECharts matches views by series id, so the
   `SankeyView` (and its `_data`) survives a `notMerge` and chord already tweened across
   one. Merging only on a scrub changed neither variant's numbers. Reverted.
2. **`series.sankey.universalTransition: { enabled: true }`.** Inert, and then still inert
   after registering the `UniversalTransition` feature in
   [`lib/echarts/echarts.ts`](../src/lib/echarts/echarts.ts) — the same
   unregistered-feature trap `LabelLayout` sets, so it was worth eliminating. Universal
   transition morphs between _different_ series (one chart becoming another); it is not a
   within-series update path. Reverted.
3. **Forcing the first-render wipe per step** (`chart.clear()` before `setOption`, or
   minting a new series id so the view is recreated) would replay `createGridClipShape`.
   Not measured, because it is the wrong effect even if it works: a left-to-right wipe
   every step reads as the panel reloading, not as a value changing, and it would discard
   pan/zoom with it.

## One symptom of the same rebuild is fixed

Because `SankeyView` rebuilds its elements, their **labels** were new objects on every pass
too — so `LabelManager._animateLabels` took its `if (!oldLayout)` branch and faded each edge
value in from zero, timed by `animationDuration` rather than by the update duration. Measured
stepping the slider: `0.001 → 1` over ~120 frames, on every step, while the node names held
at 1. A `graph` never showed it, for the same reason it has no shape tween to lose — it
updates in place.

That one **is** fixable panel-side, and is fixed: `registerEdgeLabelFadeIn` sets zrender's
`disableLabelAnimation` on every edge-label host before the label stage reads it. It is not a
workaround for the cut below — the shapes still cut — only for a label fade that made every
step read as a reload.

## What would actually fix it

An upstream change to `SankeyView.render` — diff against `this._data` and route node rects
and link curves through `graphic.updateProps` instead of `setShape`, which is what
`ChordView` already does. Worth an ECharts issue; there is no panel-side workaround that is
better than the cut.

Until then this is documented rather than worked around:
`provisioning/dashboards/relations/timeline.json` carries a chord panel beside the sankey
so the difference is visible and attributed, and `src/modules/relations/parity.md` says
which variant morphs.
