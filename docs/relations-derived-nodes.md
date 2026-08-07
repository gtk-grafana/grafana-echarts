# Derived nodes

A **derived node** is a node no frame declares: the relations family infers it from an
edge's `source` or `target` because something has to be at the end of the line. The wide
contract allows it explicitly — "when no nodes frame is present, the node set is the union
of the edges' endpoints" ([../data-plane/graph-wide.md](../data-plane/graph-wide.md)) — and
it is the _normal_ case rather than a corner one, because the two shapes users actually
have produce edges and nothing else:

- a Prometheus or Loki service graph. `sum by (source, target) (…)` is N labelled series;
  `longToWide.ts` pivots them into one `graph-edges-wide` frame, edges only, because one
  endpoint label is not a pair and a node-stat query (`sum by (server) (…)`) is a different
  conversion;
- a legacy `graph-*-long` response whose query returns edges without the paired nodes frame.

Both draw. Every node appears, connected correctly, coloured from the classic palette. What
a derived node could not do, before the pre-pass below, is **be configured** — and that is
the whole of this doc.

## Why an inferred node used to be unreachable

One rule explains all of it: **a mark is a field**. That is the premise the whole
`graph-*-wide` migration rests on — colour is `field.display(value).color`, style is
`field.config.custom.*`, a data link is `field.config.links`, hiding is
`custom.hideFrom.viz`, and each of those arrives already resolved because Grafana's override
engine matched the field upstream.

A derived node has no field. It is invented by the reader (`deriveNodesFromLinks` in
`src/lib/echarts/converters/graphWide.ts`), inside the panel, which is _downstream_ of
`applyFieldOverrides` — so there was never anything for an override to land on:

| Capability                                           | Declared node           | Derived node, before        |
| ---------------------------------------------------- | ----------------------- | --------------------------- |
| Colour (all eight modes, `byName` override)          | Yes                     | Classic palette by position |
| Unit / decimals / mappings / thresholds              | Yes, per mark           | None — no config to read    |
| `custom.nodeRadius` / `subtitle` / `fixedX`/`fixedY` | Yes                     | None                        |
| Data links (tooltip footer)                          | Yes                     | No footer at all            |
| Hide from viz                                        | Via the override engine | By **name** matching only   |
| Appears in the override picker                       | Yes                     | No                          |

The second symptom was the node's **value**. With no field to reduce, the only number
derivable was the node's degree — its link count — and it went in the value slot, where
"Show node values" drew it under the node and the tooltip labelled it `Value`. Nothing
distinguished it from a measurement the query returned, it could not be relabelled,
reformatted or switched off, and before `formatDerivedMarkValue` existed it borrowed
another mark's unit outright: with a `ms` override on the first edge, every derived node
read `2 ms`.

## The fix: declare them above the panel

`src/lib/echarts/converters/deriveNodes.ts` runs the same derivation **before**
`applyFieldOverrides`, where a field can still be created. Every endpoint the response left
undeclared becomes a real numeric field in a `graph-nodes-wide` frame, and the whole table
above flips to "Yes" with no reader change at all: the node is an ordinary mark, the
override picker lists it, `byName` matches it.

It is registered in the same pipeline prefix as the two shape converters
(`src/modules/relations/dataTransformations.ts`, via `PanelPlugin.setDataTransformations` —
[grafana/grafana#129992](https://github.com/grafana/grafana/pull/129992)) and runs **last**,
after whichever of them claimed the response: it completes the wide form rather than
producing it. Unlike them it claims nothing of its own, so it is registered on every branch,
including the already-wide one.

Three rules make it safe to leave on:

- **Nothing missing, nothing done.** The input array is returned by reference, so frame
  identity is preserved and `VizPanel.applyFieldConfig` still short-circuits.
- **Append, never rival.** Where a nodes frame already exists the new fields are appended to
  it, padded to its row count. Emitting a second, _declared_ `graph-nodes-wide` frame beside
  a merely shape-matched one would trip the contract's own precedence rule — declared wins
  as a filter — and the reader would collect the synthetic frame and drop the real one.
- **Nodes first.** A newly created frame is prepended, because Grafana assigns `seriesIndex`
  (and therefore each classic-palette colour) in field order across the response. Trailing
  it would recolour every node of every existing dashboard by the number of edges in front
  of it.

### The stat is gone, not renamed

A derived node now carries `null`, on both paths. A link count is not a measurement, and the
value slot is where measurements go; `readNodes` reduces `[null]` to `null`, `toNodeItems`
then omits `value`, so the node label stays on one line and the tooltip omits the row rather
than printing the field's empty-value text under a `Value` label. The degree is still
readable from the graph — it is how many lines touch the node.

## What is still open

**The pre-pass is gated.** The host runs panel-registered transformations only behind
`grafana.panelPluginTransformations`, which is off by default, and the API needs Grafana
13.2+. Where it does not run, `deriveNodesFromLinks` still derives the nodes inside the
panel and every row of the table above still reads "Derived node, before" — the panel draws,
the nodes are just not configurable. The two derivations share `endpointNames`, so they
produce the same node set in the same order and therefore the same palette colours; a
dashboard does not change appearance depending on whether the host ran the pass.

**Legend hiding still matches by name** for a node with no field (`hiddenNodeIds`,
`src/lib/echarts/charts/relations.ts`), for the same reason and only on that path.

**Relations stays out of `stripHiddenValueFields`.** Deleting a hidden node's column makes
the reader re-derive that node from the edges still naming it, so it comes straight back.

## See also

- [../data-plane/graph-wide.md](../data-plane/graph-wide.md) — the contract, and the
  sentence this doc expands
- [../src/modules/relations/parity.md](../src/modules/relations/parity.md) — option-by-option
  parity against core's Node graph
- [../todo/relations-data-links.md](../todo/relations-data-links.md) — gap 4, where the
  problem was first written down
- [relations-data-sources.md](./relations-data-sources.md) — which queries produce which
  shape
