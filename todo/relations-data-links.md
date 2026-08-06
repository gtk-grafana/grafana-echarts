# Data links for relations (graph / sankey / chord)

> ## Resolution — gaps 1–3 close structurally; gap 4 stays partially open
>
> [../data-plane/graph-wide.md](../data-plane/graph-wide.md) makes one node one **field**
> and one edge one **field**, so `config.links` on a mark's own field is a link on that
> mark and nothing else. Demonstrated in
> `provisioning/dashboards/relations/graph-wide.json`: a `byName` override puts a link on
> node `a` only, and `b` / `c` render no link at all.
>
> | Gap                                              | Under `graph-*-wide`                                                                                                                                                                                                                                           |
> | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1 — a link on `mainstat` is a link on every node | **Closed for wide input.** One field, one mark                                                                                                                                                                                                                 |
> | 2 — only `mainstat` is ever consulted            | **Closed for wide input.** Each mark carries its own field                                                                                                                                                                                                     |
> | 3 — a node can be handed the edges frame's field | **Closed for wide input.** Structurally impossible                                                                                                                                                                                                             |
> | 4 — derived nodes have no row                    | **Partially open.** A derived node has no _field_ either, so nothing to configure. What changes is that supplying a nodes frame becomes cheap and side-effect-free, so "add a nodes frame" is a real answer. The union-of-incident-edges question is unchanged |
> | 5 — pinning an edge replays a node tooltip       | Already fixed; unaffected                                                                                                                                                                                                                                      |
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
> observation that relations still has **no case in `dataLinks.test.tsx`** stands, and
> matters more now.
>
> Everything below remains an accurate description of the row-format behaviour.

## Problem

Users want a data link on **one node** or **one edge** — "clicking `eu-west` opens its
service dashboard", "clicking `us-west → us-east` opens the trace for that call". Both
examples are live in
[provisioning/dashboards/relations/chord.json](../provisioning/dashboards/relations/chord.json),
panel _"Dense adjacency — what a chord is for"_.

Everywhere else in Grafana this is a **field override**: pick a field, attach
`config.links`. Relations data does not have the shape that assumes. A node-graph
response is a nodes frame plus an edges frame
([data-plane/node-graph.md](../data-plane/node-graph.md)) where **each node and each
edge is a _row_**, and every node shares the same handful of columns (`id`, `title`,
`mainstat`, ...). There is no field that means "eu-west", so there is no `byName`
matcher that selects it. `FieldMatcherID` in `@grafana/data` offers `byName`,
`byNames`, `byRegexp`, `byRegexpOrNames`, `byType`, `byTypes`, `byFrameRefID`,
`byValue`, `numeric`, `time`, `first`, `firstTimeField` — every one of them selects
_fields_. `byValue` ("Fields with values" in the override UI) is a **reducer condition
over a field**, not a row filter.

This is the same row-vs-field wall the family already hit for legend hiding
([relations/parity.md](../src/modules/relations/parity.md), "No legend hide toggle")
and that the pie hit for `custom.hideFrom` ([hide-from-area.md](./hide-from-area.md)).

**Whatever is decided here must be implemented once and apply to all three variants —
`graph`, `sankey` and `chord`.** They are layout variants over one converter and one
tooltip model builder (`buildRelationsTooltipModel`, wired identically at
[options/graph.ts:317](../src/lib/echarts/options/graph.ts),
[options/sankey.ts:285](../src/lib/echarts/options/sankey.ts) and
[options/chord.ts:212](../src/lib/echarts/options/chord.ts)), so a fix in one that is
not in the others is a bug, not a scope reduction.

## What works today

The footer plumbing is real and mostly correct:

- `useFieldConfig` keeps the full standard set, so the **Data links** field-config
  editor _is_ registered for the panel — `standardOptions` only customizes entries, it
  does not restrict them (`SetFieldConfigOptionsArgs` in `@grafana/data`), and the
  module passes only `STANDARD_COLOR_OPTIONS`
  ([modules/relations/module.tsx:25](../src/modules/relations/module.tsx)).
- The converter records the backing row on every node and link:
  `sourceRowIndex: row` at
  [converters/nodeGraph.ts:236](../src/lib/echarts/converters/nodeGraph.ts) (links) and
  [:281](../src/lib/echarts/converters/nodeGraph.ts) (nodes).
- All three option builders copy it onto the ECharts data item —
  [graph.ts:256/284](../src/lib/echarts/options/graph.ts),
  [sankey.ts:176/202](../src/lib/echarts/options/sankey.ts),
  [chord.ts:141/168](../src/lib/echarts/options/chord.ts) — and ECharts preserves
  unknown data props, so the tooltip formatter reads it back off `params.data`.
- `buildRelationsTooltipModel` turns that into a `TooltipSource { field, rowIndex }`:
  the edges `mainstat` for a link
  ([tooltip/relations.ts:49](../src/lib/echarts/tooltip/relations.ts)), the node
  `mainstat` for a node ([:66](../src/lib/echarts/tooltip/relations.ts)).
- The React overlay resolves it once pinned:
  `collectDataLinks` → `getFieldDisplayLinks(field, rowIndex)`
  ([EChartsTooltip.tsx:92](../src/lib/components/tooltip/EChartsTooltip.tsx)), gated on
  `pinned` at [:258](../src/lib/components/tooltip/EChartsTooltip.tsx).
- `getFieldDisplayLinks` (`@grafana/ui`, `components/VizTooltip/utils`) calls
  `field.getLinks({ calculatedValue, valueRowIndex: rowIdx })`, and `getLinksSupplier`
  (`@grafana/data`, `field/fieldOverrides.ts`) sets
  `dataContext.value.rowIndex = config.valueRowIndex` before interpolating the URL.

So **per-row URL templating already works**: a link on `mainstat` with a URL of
`.../d/abc?var-service=${__data.fields.id}` produces a _different_ href on every node,
resolved against the frame that field belongs to. `__data.fields["NameOfField"]` is
documented at
[configure-data-links](https://grafana.com/docs/grafana/latest/panels-visualizations/configure-data-links/).

What is **not** covered anywhere: relations has no case in
[dataLinks.test.tsx](../src/lib/components/tooltip/dataLinks.test.tsx) — that suite
covers treemap, pie, matrix heatmap and binned heatmap only. The "Yes" in
[relations/parity.md:178](../src/modules/relations/parity.md) is untested, and three of
the four gaps below would have been caught by a test.

## Why the obvious approach falls short

### 1. A link on `mainstat` is a link on _every_ node

Field config is per-field and a field spans all rows, so one override paints the same
link on all nodes. `${__data.fields.id}` differentiates the link's _destination_, never
its _presence_ or its _title_-worthiness. "Only `eu-west` has a runbook" is not
expressible. This is not a plugin bug — core's own Node graph has the same shape, and
its docs say plainly: _"In node graphs, some data fields may have pre-configured data
links. To add a different data link in those cases, use a field override."_

Worse, `mainstat` legitimately exists on **both** frames. Display-name disambiguation
(`getUniqueFieldName`, `@grafana/data` `field/fieldState.ts`) only dedupes _within_ a
frame; a frame-name prefix is added only when `allFrames.length > 1` **and** the frames
carry differing non-empty `name`s. Two unnamed `csv_content` frames both exposing
`mainstat` therefore collide on one `byName` rule. The reliable escape hatch is
`byFrameRefID` ("Fields returned by query"), which is per-query — and therefore
per-frame, not per-row.

### 2. Only `mainstat` is ever consulted

`buildRelationsTooltipModel` builds `source` from exactly one field —
`ctx.valueField` / `ctx.linkValueField`
([tooltip/relations.ts:49,66](../src/lib/echarts/tooltip/relations.ts)) — and both are
resolved as a **numeric** `mainstat`:
[`getNodeGraphValueField`](../src/lib/echarts/converters/nodeGraph.ts) at nodeGraph.ts:170
and [`getLinkValueField`](../src/lib/echarts/charts/relations.ts) at relations.ts:26,
each with a `type === FieldType.number` gate. Consequences:

- A link put on `id`, `title`, `subtitle` or a `detail__*` column is **silently
  ignored**. Those are the columns a user reaches for first, since they are the ones
  that identify the node.
- `mainstat` is optional and the spec explicitly allows it to be a **string**. A frame
  with a string `mainstat`, or none at all, can render no footer whatsoever — the user
  has to invent a numeric column to hang a link on.
- Most edges frames carry `thickness` but no numeric `mainstat`, so `getLinkValueField`
  returns `undefined` and **edge links are unreachable** on that very common shape.

Contrast the pie, which carries a source field **per slice**
([tooltip/pie.ts:47-52](../src/lib/echarts/tooltip/pie.ts)) rather than one field for
the whole series.

### 3. A node can be handed the _edges_ frame's field

`getNodeGraphValueField` falls back to the edges frame's `mainstat` when the nodes
frame's is missing or non-numeric
([converters/nodeGraph.ts:170-179](../src/lib/echarts/converters/nodeGraph.ts)), but
`node.sourceRowIndex` is always a **nodes-frame** row
([:281](../src/lib/echarts/converters/nodeGraph.ts)). The tooltip pairs them without
checking they agree ([tooltip/relations.ts:66-70](../src/lib/echarts/tooltip/relations.ts)),
so a nodes frame with a string `mainstat` plus an edges frame with a numeric one
produces `{ field: edgesMainstat, rowIndex: nodeRow }`. `getLinksSupplier` is bound to
the field's own frame, so `${__data.fields.id}` then resolves to an **edge's** id at a
coincidental row. Wrong links, no error.

### 4. Derived nodes have no row — which is exactly the user's example

`deriveNodesFromLinks` cannot set `sourceRowIndex` and does not
([converters/nodeGraph.ts:330-337](../src/lib/echarts/converters/nodeGraph.ts)), so an
**edges-only** response renders nodes with no footer at all. That is the shape of the
"Dense adjacency" panel (`id,source,target,mainstat`, no nodes frame), so today
`eu-west` there can carry no link by any route. Edge-only frames are legal input and
TestData's `nodes.type: "random edges"` produces them.

### 5. Pinning an _edge_ replays a _node_ tooltip — **FIXED**

> **Resolved** in the same change set as this doc; kept here because it was a
> prerequisite for everything below and the analysis still explains the constraint.

The footer only renders when pinned, and pinning went through `replayTip`, which
dispatched `showTip` with `{ seriesIndex, dataIndex }` and nothing else — `pinnedItem`
was typed `Pick<ECElementEvent, 'seriesIndex' | 'dataIndex'>`, so `params.dataType`
(`'node'` / `'edge'`) was dropped on the way in.

ECharts cannot recover it: `TooltipView.js:223` routes an index-addressed `showTip`
into `findPointFromSeries`, which calls `seriesModel.getData()` with **no** `dataType`
— always the node itemList. It then shows the tooltip against that node's element, and
`_showSeriesItemTooltip` re-reads `dataType` from the element's own `ecData`
(`TooltipView.js:457`), i.e. `'node'`. The formatter re-ran, the sink overwrote the
correct edge model with a node model, and the pinned footer resolved the **nodes**
frame.

The fix threads `dataType` through `pinnedItem` and skips the replay entirely for an
edge, re-pinning from the model the hover already produced (the sink now records it
even while pinned). `highlight`/`downplay` _do_ honour `payload.dataType`, so those
are passed it. See `useEChartsTooltip.ts` and its
"re-pinning onto an edge of a graph-like series" tests.

Gaps 1–4 below are still open, so a correctly configured **edge** link now reaches the
right row, but the field it resolves against is still only `mainstat`.

## Options considered

**A. Document the `${__data.fields.*}` recipe; ship no code.**
Zero risk, matches core's Node graph exactly, and is honest about the ceiling.
But it does not fix gaps 2–5, so the recipe as written does not actually work on the
most common frame shapes, and it never answers "only `eu-west`".

**B. Resolve the footer from _every_ field of the row, not just `mainstat`.**
Widen `TooltipModel.source` to a list (or resolve links across `frame.fields` at
`rowIndex` inside `collectDataLinks`) so a link on `id`, `title` or `detail__*` is
found. Removes the numeric-`mainstat` precondition, makes edge links reachable on
`thickness`-only frames, and mirrors core's node-graph context menu, which surfaces
`detail__*` alongside links. Cost: one shared change in `tooltip/relations.ts` plus
`EChartsTooltip.tsx`; `TooltipSource` is used by five other families, so widening it
must not disturb them. Still per-field — every node gets the link.

**C. Per-row link _presence_ via an empty-URL convention.**
Building on B: a URL of `${__data.fields.runbook}` interpolates to `''` on rows whose
`runbook` cell is blank. `getLinksSupplier` does not drop those (it only filters
post-processor nulls), so the footer would have to skip `href === ''` itself. That
_does_ express "only `eu-west`", using nothing but a standard link and a transformation
— but it is a **divergence from core**, which renders such a link anyway, and it makes
an empty href silently meaningful. Needs an explicit decision, not a drive-by.

**D. Invent a `link__*` frame convention.**
A column whose values are URLs, rendered as one footer link per row. Fully per-row, but
it adds a field to a spec this repo deliberately mirrors rather than extends
([data-plane/node-graph.md](../data-plane/node-graph.md)), duplicates what C achieves
with stock Grafana, and would have to be argued upstream to be worth anything.

**E. A panel option mapping node id → link.**
Expresses the requirement exactly and nothing else does. But it is a bespoke link
editor, it lives outside the field-config system (so no override UI, no
`${__data...}` interpolation for free), and it goes stale the moment the query returns
different ids. Against "align with core Grafana", this is the weakest option.

## Recommendation

**There is no straightforward solution for per-node link _presence_, and pretending
otherwise would mean inventing API.** Grafana has no row-scoped override matcher, and
core's Node graph has the identical limitation. What _is_ straightforward is making the
per-node link _destination_ actually work, which is most of the practical value.

So: **fix the remaining plumbing (gaps 2–4), then B, then document A. Treat C as a
follow-up decision, and reject D and E.**

Order matters — gap 3 will hand users wrong links whichever field set is consulted.
Gap 5 is already done, which unblocks the rest.

## Next steps

1. ~~**Thread `dataType` through the pin path.**~~ **Done** — `pinnedItem` carries
   `dataType`, `onChartClick` records it, and the pin path skips `replayTip` for an
   edge rather than teaching ECharts to address one (it cannot: `findPointFromSeries`
   has no `dataType` parameter). See gap 5 above.
2. **Make the node source frame-consistent.** Either resolve the node value field
   strictly from the nodes frame, or carry the owning frame alongside `sourceRowIndex`
   so `tooltip/relations.ts:66` can refuse a mismatched pair instead of silently
   resolving the wrong frame.
3. **Implement B** in `buildRelationsTooltipModel` + `collectDataLinks`, keeping the
   existing single-`source` shape working for the other five families.
4. **Decide C** explicitly (empty href → hide the link, yes or no) and record the
   answer in `relations/parity.md` either way.
5. **Add a relations case to
   [dataLinks.test.tsx](../src/lib/components/tooltip/dataLinks.test.tsx)** — one node
   hit and one edge hit, and, per the rule at the top of this doc, run it for all three
   of `graph`, `sankey` and `chord`. The existing harness (`hoverAndPin` through
   zrender's real `Handler`) already does exactly what is needed.
6. **Add a provisioned demo panel** with a link on the nodes frame using
   `${__data.fields.id}`, and update
   [relations/parity.md:178](../src/modules/relations/parity.md), whose current "Yes"
   overstates what ships.

## Open questions

- Should a **derived** node (edges-only response, gap 4) resolve links from the edges
  frame rows that reference it? A node appears in many edge rows, so there is no single
  row — the union of its incident rows' links is defensible but has no precedent here.
- `FieldConfigProperty.Actions` is registered along with the rest of the standard set,
  but the footer only renders `dataLinks` and `adHocFilters`
  ([EChartsTooltip.tsx:265](../src/lib/components/tooltip/EChartsTooltip.tsx)). Core's
  Node graph documents actions as unsupported for that visualization; this family
  should either match that or say so in parity.md.
- `detail__*` still has no surface at all ("`detail__*` has no context menu" in
  parity.md). B would make its _links_ reachable while its _values_ stay invisible,
  which is a slightly odd halfway house — folding `detail__*` into tooltip rows may
  belong in the same change.
