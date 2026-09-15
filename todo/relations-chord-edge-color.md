# Chord ribbons ignore fixed edge colors

## Status

A ribbon is the filled shape between two chord arcs. This bug affects chord charts in the relations family. A fixed
field color reaches the ECharts option, but it does not fill the chord ribbon.

Threshold and continuous field colors use the same literal color path.

## Observed behavior

A field color has priority over `relationsLinkColor`. This priority works for graph and Sankey charts. For a chord edge,
the field color hides the panel setting and the ribbon loses its requested fill.

The dashboard can show a dark ribbon instead of the color from the field override.

## Mechanism

The color follows this path:

1. Grafana applies the field override to the edge field.
2. [`edgeColorOf`](../src/lib/echarts/relations/converters/markRead.ts) reads the display color and stores it as
   `link.color`.
3. The [chord adapter](../src/lib/echarts/relations/options/chord.ts) writes the color to `links[].lineStyle.color`.
4. The [ECharts chord renderer](https://github.com/apache/echarts/blob/master/src/chart/chord/ChordEdge.ts) assigns a
   ribbon fill only for `source`, `target`, and `gradient`.

A literal color becomes a stroke color. The default chord stroke width is zero. The ribbon does not receive the literal
fill color.

## Reproduction

The test in [chordColor.canvas.test.tsx](../src/lib/components/canvas-tests/relations/chordColor.canvas.test.tsx)
reproduces the bug without dashboard data. It gives edge `e1` the fixed color `#ff00ff`. The passing canvas baseline
records the ribbon without that requested fill.

Run the reproduction:

```shell
GEN_CANVAS_OUTPUT_ON_PASS=1 pnpm exec jest src/lib/components/canvas-tests/relations/chordColor.canvas.test.tsx --runInBand
```

Potential fix without echarts change:

1. Post-render fill repair via registerUpdateLifecycle. The repo already does exactly this shape in
   src/lib/echarts/relations/edgeLabels/register.ts, and the existing readGraph() helper already accepts chord —
   ChordSeriesModel.getGraph() exists (ChordSeries.js:103) and ChordEdge.updateData calls edgeData.setItemGraphicEl(),
   so edgeData.getItemGraphicEl(i) hands you the ribbon. On series:afterupdate, for each edge whose lineStyle.color is
   not one of the three keywords, set el.style.fill and markRedraw(). Hover survives: zrender merges emphasis state
   style over normal style, and the emphasis state only carries opacity, so the fill persists. ~30 lines plus a canvas
   test.
