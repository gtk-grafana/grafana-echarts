# Data links for relations (graph / sankey / chord)

> ## Resolution — gaps 1–3 are closed and shipped; gap 4 is closed wherever the derived-node pre-pass can run
>
> **Shipped in phase 5 of [graph-wide-migration.md](./graph-wide-migration.md), and
> demonstrated on the relations panel in phase 6.**
> [../data-plane/graph-wide.md](../data-plane/graph-wide.md) makes one node one **field**
> and one edge one **field**, so `config.links` on a mark's own field is a link on that
> mark and nothing else — and the panel now resolves the footer from the hovered mark's
> own field rather than from one field per series (`getRelationsTooltipMarks`,
> `lib/echarts/tooltip/relations.ts`). Demonstrated on core panels in
> `provisioning/dashboards/relations/graph-wide.json` and on the relations panel itself in
> `provisioning/dashboards/relations/per-mark-tooltip-links.json`: a `byName` override
> puts a runbook link on node `db` and a trace link on edge `api-db`, and every other mark
> pins a tooltip with no footer at all.
>
> | Gap                                              | Under `graph-*-wide`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
> | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1 — a link on `mainstat` is a link on every node | **Closed for wide input.** One field, one mark                                                                                                                                                                                                                                                                                                                                                                                                                          |
> | 2 — only `mainstat` is ever consulted            | **Closed for wide input.** Each mark carries its own field                                                                                                                                                                                                                                                                                                                                                                                                              |
> | 3 — a node can be handed the edges frame's field | **Closed for wide input.** Structurally impossible                                                                                                                                                                                                                                                                                                                                                                                                                      |
> | 4 — derived nodes have no row                    | **Closed where the pre-pass runs.** `converters/deriveNodes.ts` declares every endpoint the response left implicit as a field, above the panel, so a derived node is an ordinary override target with a row of its own; it reverts to having no field only on a host without `panelPluginTransformations`. The union-of-incident-edges question is moot — the node has its own config now. See [../docs/relations-derived-nodes.md](../docs/relations-derived-nodes.md) |
> | 5 — pinning an edge replays a node tooltip       | Already fixed; unaffected                                                                                                                                                                                                                                                                                                                                                                                                                                               |
>
> **"Closed for wide input" is not "closed".** An adapter inside the panel runs _after_
> `applyFieldOverrides`, so legacy row-format input can never gain per-mark links however
> the panel reshapes it. Only a user-added **Rows to fields** transformation runs early
> enough. That asymmetry is why the migration plan surfaces a notice rather than adapting
> silently — see [graph-wide-migration.md](./graph-wide-migration.md).
>
> Of the options considered here: **B** and **C** remain the answer for legacy input and
> become unnecessary for wide input; **D** (`link__*` column convention) is now clearly
> the wrong shape, since `config.links` is the real thing; **E** stays rejected. The
> observation that relations had **no case in `dataLinks.test.tsx`** is **resolved**: the
> suite now drives real hovers through zrender for a node, an edge, and the marks that
> carry no link, addressing each mark by the position ECharts laid it out at rather than
> by scanning for one — a scan cannot say _which_ mark was hit, and that is the claim.
>
> Everything below is retained as background on the row-format problem the pivot solved.

## Problem, and what already worked

Users want a data link on **one node** or **one edge** — "clicking `eu-west` opens its
service dashboard", "clicking `us-west → us-east` opens the trace for that call." Every
other Grafana panel does this with a field override, but a legacy node-graph response is
a nodes frame plus an edges frame where **each node and each edge is a row**
([data-plane/graph-long.md](../data-plane/graph-long.md)) — there is no field named
`eu-west` for `byName` to select, and `FieldMatcherID` has no row-selecting member.
Whatever the fix, it had to land once and apply to all three variants (`graph`, `sankey`,
`chord`), since they share one converter and one tooltip model builder.

Per-**row URL templating** already worked even before the pivot: `${__data.fields.id}` on
a `mainstat` override produced a different href per node, because `getLinksSupplier`
resolves the row index the option builders already recorded. What did not work is gaps
1–4 below.

### Gaps 1–3 (row form only, closed for wide input by the pivot)

All three were shapes of the same problem: a link is field-scoped, but the old converter
(`nodeGraph.ts`, since deleted) resolved every mark's tooltip source from **one shared
field** (`mainstat`) rather than the mark's own row.

1. **A link on `mainstat` painted on every node** — field config is per-field and a field
   spans every row, so "only `eu-west` has a runbook" was inexpressible.
2. **Only `mainstat` was ever consulted** — a link on `id`, `title`, `subtitle` or a
   `detail__*` column was silently ignored, and an edges frame with no numeric `mainstat`
   (a common shape) made edge links unreachable entirely.
3. **A node could be handed the edges frame's field** — the value-field lookup could fall
   back to the wrong frame without the tooltip noticing, producing a link that resolved to
   a coincidental edge's id at a coincidental row.

Per the banner above, all three are structurally impossible once a mark is a field: each
mark carries its own field, so there is no shared column to mis-target and no fallback to
the wrong frame.

## Gap 4: derived nodes had no row — which was exactly the user's example

The row-form reader's `deriveNodesFromLinks` could not set `sourceRowIndex`, so an
**edges-only** response rendered nodes with no footer at all — the shape of the "Dense
adjacency" panel (`id,source,target,mainstat`, no nodes frame), so `eu-west` there could
carry no link by any route. Edge-only frames are legal input and TestData's
`nodes.type: "random edges"` produces them. The wide contract's equivalent is exercised in
[relationsGraph.test.ts](../src/lib/echarts/converters/relationsGraph.test.ts) (the "reads
an edges-only response, deriving its nodes" case, asserting `node.field === undefined`) —
still the behaviour on a host that cannot run the `deriveNodes.ts` pre-pass, which is why
the banner above closes this gap only "where the pre-pass runs."

## Gap 5: pinning an edge replayed a node tooltip — FIXED

Pinning went through `replayTip`, which dispatched `showTip` with only
`{ seriesIndex, dataIndex }` — `params.dataType` (`'node'` / `'edge'`) was dropped on the
way in, and ECharts cannot recover it from an index alone, so a pinned edge's footer
silently re-resolved against the wrong node. The fix threads `dataType` through
`pinnedItem` and skips the replay entirely for an edge, re-pinning from the model the
hover already produced. See `useEChartsTooltip.ts` and its "re-pinning onto an edge of a
graph-like series" tests.

## Options considered, and next steps

Five options were weighed for per-node link **presence** (as opposed to per-node link
**destination**, which already worked): **(A)** document the `${__data.fields.*}` recipe
and ship no code; **(B)** resolve the tooltip source from every field of the row, not just
`mainstat`; **(C)** build on B with an empty-URL-means-no-link convention; **(D)** invent a
`link__*` frame column; **(E)** a panel option mapping node id → link. D and E were
rejected outright — D duplicates what C achieves with stock Grafana and argues for
extending a spec this repo deliberately mirrors instead; E is a bespoke link editor
outside the field-config system, with no override UI and no `${__data...}` interpolation.
**Per the banner above, B and C remain the answer only for legacy row-format input — wide
input needs neither**, since `config.links` on a mark's own field already is what B and C
were trying to achieve.

Of the six next steps originally scoped: threading `dataType` through the pin path (gap 5)
shipped; adding a relations case to
[dataLinks.test.tsx](../src/lib/components/tooltip/dataLinks.test.tsx) shipped (real
hovers through zrender for a node, an edge, and marks with no link, across all three
variants); and a provisioned demo panel shipped as
`provisioning/dashboards/relations/per-mark-tooltip-links.json`. The other three — making
the node source frame-consistent, implementing B, deciding C — are obviated rather than
done: each was a row-form-only problem that the field pivot closed structurally.

## Open questions

- ~~Should a **derived** node (edges-only response, gap 4) resolve links from the edges
  frame rows that reference it?~~ **Answered differently.** The node gets a field and a row
  of its own instead, above the panel (`converters/deriveNodes.ts`), so its links come from
  its own `config.links` like every other mark and the union question does not arise. It
  still arises on a host that cannot run the pre-pass, where the node has no field at all.
- `FieldConfigProperty.Actions` is registered along with the rest of the standard set,
  but the footer only renders `dataLinks` and `adHocFilters`
  ([EChartsTooltip.tsx:265](../src/lib/components/tooltip/EChartsTooltip.tsx)). Core's
  Node graph documents actions as unsupported for that visualization; this family
  should either match that or say so in parity.md.
- `detail__*` still has no surface at all ("`detail__*` has no context menu" in
  parity.md). Per-mark links are reachable now while `detail__*` values stay invisible,
  which is a slightly odd halfway house — folding `detail__*` into tooltip rows may
  belong in a follow-up change.
