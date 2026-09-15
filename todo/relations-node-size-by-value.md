# Size a graph node by its value

## Status

Graph node size does not use the node value. The proposed value-based scale remains open and must be opt-in.

## Release impact

This opt-in graph enhancement is post-release. It does not block the Relations plugin release.

## What happens today

A graph node's diameter never depends on its value:

```ts
// src/lib/echarts/relations/options/items.ts
symbolSize: node.radius ?? defaultSize,   // custom.nodeRadius, else relationsNodeSize
```

`node.value` is attached to the item (for the tooltip, the label and the colour lookup) and
reaches `symbolSize` nowhere. The same is true of a graph edge's width, which is
`link.width` — `custom.lineWidth`. So on a graph, changing the reducer moves nothing
geometric at all; it changes colours, labels and tooltip rows. Confirmed by measurement: the
all-options reference panel for "Calculation" had to switch "Show node values" on before it
differed from the same panel at the default in any way.

What the value _does_ size is a **sankey ribbon and a chord arc**, because ECharts derives
those from the item value. That half of the old comments was right.

## Why it is worth having

It is the one thing a reader expects from a weighted topology, and the reason the wrong
comment went unchallenged for so long: "the number that sizes a node" is what a main stat
_should_ mean. Core Grafana's Node graph does not do it either (its nodes are fixed circles
with arcs), so this is an ECharts-only improvement rather than a parity gap.

## Design questions, because the obvious version is wrong

1. **Absolute or relative?** Using the raw value as pixels breaks on any real unit — a
   node at 4.2 ms is invisible and one at 120 000 requests fills the panel. It has to be a
   scale across the marks present: map `[min, max]` of the nodes' `calcs[0]` onto a pixel
   range.
2. **What does "Node size" mean then?** Today it is _the_ diameter. The natural reading
   afterwards is the **maximum**, with a floor so the smallest node stays hoverable — say
   `[0.35 × size, size]`. That silently redefines an existing option, so it may want to
   become "Max node size" with the old behaviour available.
3. **Opt-in or automatic?** Automatic changes every existing panel's appearance. A
   `Size by value` switch (Default-tier, off) is the conservative shape and keeps
   `relationsNodeSize` meaning what it means now.
4. **Precedence.** `custom.nodeRadius` must keep winning: it is an explicit per-node
   answer, and the smiley-face panel in `all-options.json` depends on it.
5. **Nodes with no value.** An edges-only response derives every node and none carries a
   stat (`hasNoNodeStats`). Those must fall back to the flat size rather than to the floor,
   or an edges-only graph would draw every node at its smallest.
6. **Which variants?** Graph only. A sankey and chord node already size by flow, so the
   switch should hide itself there — the same reasoning that hides `animation.enabled` on
   graph.

## Cost

Small in code — a scale in `toNodeItems` plus one option — and wider in tests: new canvas
baselines for the graph variant at both settings, a unit test per design question above,
and a panel in `all-options.json` (which is the request that started this).
