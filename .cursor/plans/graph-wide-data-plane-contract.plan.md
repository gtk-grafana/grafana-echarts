# A field-based data plane contract for graph frames

## Context

`todo/relations-item-overrides.md` diagnosed a wall: Grafana's override system is field-scoped (`FieldMatcher` is `(field, frame, allFrames) => boolean`), but a node-graph response makes every node and every edge a **row**. So "colour `eu-west` red" or "link `us-west → us-east` to a trace" is inexpressible, and five escape routes were enumerated — four of which need core changes.

That doc's recommendation (option 4) became [grafana/grafana#129905](https://github.com/grafana/grafana/pull/129905), a draft POC adding `fieldConfig.itemOverrides`: a second, permanent override system parallel to the field one. Its cost is visible in the diff — **80 files, ~3,800 added lines** across five CUE schema copies, Go conversions in both directions over four dashboard versions, regenerated OpenAPI, a feature toggle, a new `itemMatchers` registry, new matcher editors and a new resolver. Its own plan doc scopes it at **seven PRs**. The PR author's note is the starting point here:

> "looking at this PR makes me realize that node-graph avoided public docs for the graph frame spec for a reason, which is that it was created specifically for the node-graph panel which at the time didn't need full core interop with field overrides. But now I think we might want to provide a transform for legacy support in the node graph, and define the public node contract differently…"

This plan asks the inverted question: if the marks were **fields** instead of rows, would the wall exist at all?

The answer is no, and the reason is structural rather than clever. Today's nodes and edges frames are not a novel kind; they are ordinary **`numeric-long`** frames with reserved column names — `source`/`target` are dimension columns, `mainstat` is the value column. The data plane already has the vocabulary (`-wide` / `-long` / `-multi`), the naming convention, and an explicit invitation: _"You can propose a new data plane type: They're designed to grow into maturity, not limit innovation."_

One precision on how free the pivot is. The node-graph **format** _is_ published — on the panel page, under [Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api). What was never minted is a **data plane kind**: `DataFrameType` in `@grafana/data` 13.1.1 has twelve members and none is graph-related, and the published contract spec lists only nine types across four kinds. So the existing format must keep working, but nothing constrains what a new kind looks like.

## Goal

Specify **`graph-nodes-wide` / `graph-edges-wide`** — a field-based data plane contract in which one node is one field and one edge is one field — and produce the evidence that it delivers every capability the relations family has or has proposed, without `itemOverrides`, without a new `FieldType`, and without any required core change.

The deliverable of _this_ plan is the **contract specification plus its validation**, not the relations rewrite. The rewrite is scoped here as a follow-on; the legacy interop transformation is a separate plan (see [Out of scope](#out-of-scope)).

## Approach

**One node is one field; one edge is one field.** Everything else follows, because a field is the unit Grafana's whole configuration pipeline already addresses.

Four decisions shape the design, each resting on a verified core behaviour:

1. **Reuse the shape core already has.** Naming follows `DataFrameType`'s existing `<kind>-<shape>` convention (`timeseries-wide`, `numeric-wide`, `heatmap-cells`). Today's format is retroactively `graph-*-long`; the new one is `graph-*-wide`. A new kind starts at `meta.typeVersion` `0.x` by the contract spec's own versioning rules.

2. **Identity is the field name; dimensions are labels.** This is the contract spec's own answer to "how is an entity identified": _"Each item of data in a set is uniquely identified by its **name** and its **dimensions**… In a data frame, dimensions are in either a field's **label** property or in **string field**."_

   The split matters, and it is dictated by `getFieldDisplayName`: a **single** shared label key folds into the display name as just its value (`eu-west`), but **two** label keys format as `{source="a", target="b"}`. So an edge takes its identity from `field.name` and carries `source`/`target` only as topology. Nodes may use either.

3. **`byName` already matches these.** Verified in `nameMatcher.ts`: the matcher returns `name === field.name || name === getFieldDisplayName(field, frame, allFrames) || fallback(...)`. Raw name _or_ display name. (`byRegexp` tests the display name only — the contract doc must say so.) Nothing needs to change for an override to target a node or an edge.

4. **No new `FieldType`.** Node and edge fields are `FieldType.number`; role is frame-level and identity is name/labels. `FieldType.nestedFrames` was considered for edges and rejected: `DataFrameJSON` cannot serialize nested frames, so they do not survive snapshots. Avoiding a `FieldType` keeps the contract adoptable with zero core dependency, which is the point.

The pivot is not novel inside this repo — **part-to-whole already made it**. Pie deleted its long-format path and became wide-only precisely so one field = one slice, delegating to `getFieldDisplayValues` (`data-plane/part-to-whole.md:20-24, 126-130`). Relations is the same move on a graph.

### Sourcing: the contract is cheaper to produce than the current one

The sharpest practical argument. A Tempo/Prometheus service-graph query already returns one field per edge with the endpoints in labels:

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Today `docs/relations-data-sources.md` needs **two SQL Expressions** to reshape that into `id`/`source`/`target`/`mainstat`. Under the wide contract it needs a label-key setting and nothing else.

For SQL and CSV, core's **`rowsToFields`** already performs the pivot, and its label behaviour is exactly what is needed — per the official docs, _"If a field does not map to config property Grafana will automatically use it as source for a label on the output field."_ So `id → Field name`, `mainstat → Field value`, and `source`/`target` fall through to labels.

**Who runs it matters more than whether it can be run.** Two paths exist, and only one of them unlocks overrides:

- **User-added, in the Transform tab.** Runs in the transformation pipeline, i.e. **before** `applyFieldOverrides`. This is the path that makes per-node and per-edge overrides reach the result, and it is the one the contract depends on.
- **Panel-invoked.** `transformDataFrame(configs, frames)` _is_ exported from `@grafana/data`, and it resolves ids through `standardTransformersRegistry.getIfExists(config.id)` — a registry that is empty in the package but populated by Grafana core at runtime, so `rowsToFields` is reachable from a plugin. Useful as an implementation of the `legacyToWide` adapter; **not** a substitute for the user-added transform, because a panel-invoked transform still runs after `applyFieldOverrides`. See [Task 4](#task-4--write-todograph-wide-migrationmd) for the trade-offs and [Complexity: core node graph panel](#complexity-core-node-graph-panel) for why the distinction decides the interop design.

### The proposed contract

#### Edges frame — `graph-edges-wide` (required)

| Element                                                                | Carries                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| One **numeric field** per edge                                         | The edge. Values are its weight over the row dimension                                                                        |
| `field.name`                                                           | **Edge id and override target.** Must be meaningful — a field named `Value` degrades the display name to the raw label format |
| `field.labels.source` / `.target`                                      | Endpoints. Label keys configurable (default `source`/`target`) so `client`/`server` works unchanged                           |
| Field-name split, on a configured separator (default `→`, accept `->`) | Endpoint fallback when labels are absent                                                                                      |
| Optional leading `time` / `string` field                               | Row dimension. Absent ⇒ single-row instant data, as today                                                                     |
| `config.displayName`                                                   | Edge label                                                                                                                    |
| `config.color`                                                         | Edge colour — **all eight modes**, including by-value over the edge's own values                                              |
| `config.links`                                                         | Per-edge data links                                                                                                           |
| `config.unit` / `decimals` / `mappings` / `thresholds` / `min` / `max` | Tooltip formatting and data-driven colour                                                                                     |
| `config.custom.lineWidth` / `.curveness` / `.lineType` / `.hideFrom`   | Plugin-declared per-edge style                                                                                                |

#### Nodes frame — `graph-nodes-wide` (optional, as today)

| Element                                                                                  | Replaces                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| One **numeric field** per node; name = node id                                           | `id` column                                                                                                      |
| Reduced value — `reduceOptions.calcs[0]`, `[1]`                                          | `mainstat`, `secondarystat`                                                                                      |
| `config.displayName`                                                                     | `title`                                                                                                          |
| `config.color.fixedColor` / `thresholds` / `mappings`                                    | `color` column, including the **numeric** form that is specced today but read by nobody (`nodeGraph.ts:160-168`) |
| `config.links`                                                                           | _(no equivalent today — the gap `relations-data-links.md` cannot close)_                                         |
| `config.custom.nodeRadius` / `.subtitle` / `.icon` / `.fixedX` / `.fixedY` / `.hideFrom` | `noderadius`, `subtitle`, `icon`, `fixedx`, `fixedy`                                                             |
| `field.labels`                                                                           | `detail__*`                                                                                                      |
| `config.thresholds` steps                                                                | `arc__*` (approximation — see Risks)                                                                             |

#### Frame role resolution

In precedence order, mirroring how `hierarchy.ts` already layers meta over field shape:

1. `frame.meta.type === 'graph-edges-wide' | 'graph-nodes-wide'` — authoritative when the datasource can set it.
2. **Field shape** — a frame whose numeric fields carry both endpoint labels, or whose names split on the separator, is the edges frame; the other is nodes. This is the only signal that survives `csv_content` fixtures, SQL Expressions and `rowsToFields`, which is why `nodeGraph.ts:115-128` already made field shape primary.
3. **Panel option** — a refId picker overriding 1 and 2. Precedent: XY chart, geomap layers.

A **single-frame variant** using the `node__` / `edge__` field-name prefix (the prefix idea from the brief) is specified as a documented alternative for sources that can emit neither meta nor labels. It is not the headline form: prefixes leak into the override picker unless every field also sets `displayName`, and they destroy the zero-reshape Prometheus path.

### What this buys, concretely

Every row below is a currently documented bug, gap or unbuilt feature. Each becomes standard field behaviour rather than plugin code:

| Documented problem                                                     | Where                                                   | Under `graph-*-wide`                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Only 2 of 8 colour modes reach the chart                               | `relations-color-schemes.md`; `options/graph.ts:91-124` | `makeRelationsColorResolver` **deleted**; colour is `field.display(value).color`, as in every other family |
| Edges have no colour-scheme path at all                                | `toLinkItems` takes no `ctx` (`graph.ts:322`)           | An edge is a field; it has a display processor                                                             |
| A `byName` fixed colour is not theme-resolved                          | `seriesConfig.ts:116-127`                               | Resolved upstream by `applyFieldOverrides`                                                                 |
| `field.state.range` contaminated by `noderadius`/`arc__*`/`fixedx`     | `relations-color-schemes.md`                            | Those become config, not numeric fields; the domain is node values only                                    |
| A link on `mainstat` paints on **every** node                          | `relations-data-links.md` gap 1                         | `config.links` on one node field paints on one node                                                        |
| Only `mainstat` consulted for links; edges usually unreachable         | gap 2                                                   | Each item's own field is consulted                                                                         |
| A node can be handed the **edges** frame's field                       | gap 3                                                   | Structurally impossible                                                                                    |
| Tooltip unit decided by frame order, not the hovered item              | `formatter.ts`, `Panel.tsx:56-59`                       | Each item has its own `field.display`                                                                      |
| `custom.hideFrom` registered with no reachable editor                  | `fieldConfig.ts:59-80`                                  | A real per-node/per-edge override                                                                          |
| Legend hiding re-implemented by name; `stripHiddenValueFields` skipped | `charts/relations.ts:56-72`, `panelOption.ts:70-72`     | Standard field visibility                                                                                  |
| Per-item colour, links, size, curveness                                | `relations-item-overrides.md` (unbuilt)                 | A `byName` override — no new editor, no new schema                                                         |
| Two SQL Expressions to reshape Prometheus                              | `relations-data-sources.md`                             | Zero reshaping                                                                                             |
| Instant queries mandatory                                              | `relations-data-sources.md`                             | Range queries reduce naturally                                                                             |

The three relations todo docs currently give **three different answers** to the targeting question (extend the legend / reject a panel-option map / ship a panel-option map). The wide contract dissolves the question rather than arbitrating it.

### Complexity: relations family

**Deleted** — `makeRelationsColorResolver` and its hierarchy twin; the 14 lowercase field-name constants with `readNodes`/`readLinks`/`colorAt`/`numberAt`/`stringAt`; `getNodeGraphValueField` / `getLinkValueField` and the frame-mismatch bug; `getSeriesColorOverride` / `getHiddenSeriesNames` for this family; the `stripHiddenValueFields` exclusion; `resolveArcBorderColor`; `toLineType`. Plus the **never-built** `RelationsItemRulesEditor`, its schema, its migration handler and its precedence rules.

**Added** — `addStandardDataReduceOptions` and a reduce pass (pattern exists: `resolvePieSlices`, `pie.ts:90`); endpoint resolution from labels or name; `useCustomConfig` for the node/edge custom properties; a `legacyToWide` adapter.

Net: `nodeGraph.ts` (381 lines) should roughly halve, the colour path collapses to nothing, and the per-item feature ships as configuration rather than code. **Verdict: materially less complexity for strictly more functionality.**

The architectural rule that keeps it that way: **the adapter runs at the frame boundary, so the converter only ever sees the wide form.** One internal model, one adapter; deleting legacy later is deleting one function.

### Complexity: core node graph panel

**The panel gets simpler.** It would delete `NodeGraphDataFrameFieldNames` (and the deprecated camelCase duplicate still shipping from `@grafana/ui`), its per-row colour and stat resolution, and its bespoke detail plumbing — and gain field overrides, units, thresholds, mappings and data links for free.

**The migration is the cost, and it is real.** Tempo, AWS X-Ray and TestData all emit the long form natively and will for years, so the panel needs a permanent long→wide adapter plus a `schemaVersion` migration. But that is paid **once, in one panel**, against `itemOverrides`' cost of a second override system in the dashboard schema, five CUE copies and four Go conversion pairs — paid **forever, by everyone**.

One asymmetry decides it: an adapter _inside_ a panel runs after `applyFieldOverrides`, so legacy input can never gain per-item overrides — and this holds however the adapter is implemented, including by calling `transformDataFrame` with a `rowsToFields` config, because the call site is still downstream of the override pass. Only a transformation the **user** has placed in the pipeline runs early enough. That is why interop is a transformation and not a panel feature, and it is the strongest argument that the contract, not the override engine, is the thing to change.

## Worked examples: legacy vs. wide, as CSV

These are `csv_content` fixtures — the format the provisioned relations dashboards already use, and the one that can set neither `meta` nor labels. Writing the contract out in CSV is therefore the harshest test of it, and it exposes two properties up front:

- **CSV cannot express labels.** A header cell is a field name and nothing else. So the direct-CSV path uses the field-name separator (`->`; the contract also accepts `→`), and labels require `rowsToFields`.
- **CSV cannot express field config.** `title`, `color`, `noderadius` have no home in a wide CSV. They are dashboard configuration now — which is the entire point, since that is what makes them overridable — but it means a raw wide fixture carries identity and values only. `rowsToFields` restores the rest by mapping columns onto config.

Every CSV block below is literal `csv_content` — paste it and it runs.

### 1. Chain DAG — 3 nodes, 2 edges (the baseline)

Legacy edges frame:

```csv
id,source,target,mainstat
a->b,a,b,420
b->c,b,c,380
```

Wide edges frame:

```csv
a->b,b->c
420,380
```

Two fields, one per edge. The field name is the edge id _and_ the override target; endpoints parse out of it. Renders in `graph`, `sankey` and `chord`.

### 2. Cycle and self-loop — 2 nodes, 3 edges

Legacy:

```csv
id,source,target,mainstat
a->b,a,b,420
b->a,b,a,380
a->a,a,a,90
```

Wide:

```csv
a->b,b->a,a->a
420,380,90
```

Structurally identical. **The contract change does not touch cycle handling**: the sankey DAG throw is an ECharts constraint, so `converters/dag.ts` still breaks cycles and drops self-loops for that variant, and `graph`/`chord` still render both. Worth stating explicitly in the contract doc so nobody expects the pivot to fix it.

### 3. Fan-out / fan-in DAG — 4 nodes, 4 edges (sankey's natural shape)

Legacy:

```csv
id,source,target,mainstat
a->b,a,b,60
a->c,a,c,40
b->d,b,d,60
c->d,c,d,40
```

Wide:

```csv
a->b,a->c,b->d,c->d
60,40,60,40
```

Four independently overridable ribbons. Colouring only `a->c`, or curving only it, is impossible today and is a two-click `byName` override here.

### 4. Nodes frame — 3 nodes (where config-vs-data becomes visible)

Legacy:

```csv
id,title,mainstat
a,Gateway,12
b,API,8
c,DB,3
```

Wide, direct CSV — values and identity only:

```csv
a,b,c
12,8,3
```

The titles are gone: `Gateway` / `API` / `DB` become `displayName` on fields `a` / `b` / `c`, i.e. three `fieldConfig.overrides` entries — which, unlike today, are editable in the UI.

To keep them in the query instead, run the _legacy_ CSV through `rowsToFields`:

| Mapping                      | Result                          |
| ---------------------------- | ------------------------------- |
| `id` → **Field name**        | fields `a`, `b`, `c`            |
| `mainstat` → **Field value** | values `12`, `8`, `3`           |
| `title` → **Display name**   | `Gateway`, `API`, `DB`          |
| any unmapped column          | falls through to `field.labels` |

That is the full-fidelity path, and it needs no new code. A node with no edges is unaffected by the pivot — it requires a nodes frame in either form.

### 5. Dense adjacency — 3 nodes, 6 edges (chord, and where the matrix wins)

Legacy:

```csv
id,source,target,mainstat
a->b,a,b,10
a->c,a,c,20
b->a,b,a,30
b->c,b,c,40
c->a,c,a,50
c->b,c,b,60
```

Wide, edge-per-field:

```csv
a->b,a->c,b->a,b->c,c->a,c->b
10,20,30,40,50,60
```

Six fields for three nodes — the N·(N−1) growth. At 30 nodes that is 870 fields, which is the dense-graph risk in concrete form.

Wide, adjacency matrix:

```csv
source,a,b,c
a,,10,20
b,30,,40
c,50,60,
```

Three fields plus a key column, regardless of density, and producible from the legacy CSV today by core's `groupingToMatrix` (Column = `target`, Row = `source`, Cell value = `mainstat`). Per-node overrides work because a column is a node; **per-edge overrides do not, because an edge is a cell**. Two details the contract must pin down: the empty diagonal arrives as `''` from `csv_content` and must read as "no edge" rather than zero (`groupingToMatrix` exposes this as its `emptyValue` option); and a `byName` override on column `a` could mean "node a" or "all inbound edges of a" — the contract assigns it to the node.

### 6. Two hazards the wide form introduces

**Parallel edges cannot be expressed in direct wide CSV.** Legacy tolerates two rows over the same pair:

```csv
id,source,target,mainstat
e1,a,b,10
e2,a,b,20
```

Wide needs distinct field names, and naming both `a->b` collides — `getUniqueFieldName` silently renames the second to `a->b 2`, which changes the override target and breaks name-based endpoint parsing. The clean form keeps the ids as names and puts endpoints in labels, which CSV cannot do — so this shape is `rowsToFields`-only:

```csv
e1,e2
10,20
```

**Separator collision.** A node literally named `a->b` produces `a->b->c`, which parses two ways. The name-split form has to pick a rule (or reject); labels have no such problem.

Both hazards point the same way, and reinforce the ordering already in the contract: **labels are the primary endpoint carrier, name-splitting is the fallback for sources that cannot emit labels.** The contract doc must state the parallel-edge limitation plainly rather than leave it to be discovered.

## File Changes

This plan produces specification and evidence. Every path below is a doc or a fixture.

**Create**

- `data-plane/graph-wide.md` — **the contract.** Written to the standard of `data-plane/node-graph.md`: role resolution, both frame specs, the full field-config mapping, the `reduceOptions` contract, the single-frame prefix variant, ECharts mapping, pitfalls, worked examples.
- `todo/graph-wide-migration.md` — the relations rewrite plan: phase order, the `legacyToWide` adapter contract, the `dataFormat` panel option and its migration, per-gap disposition for all three relations todo docs, and what is deliberately not carried over.
- `provisioning/dashboards/relations/graph-wide.json` — the **proof**, following the existing convention of pairing each panel against a comparison.

**Modify**

- `data-plane/node-graph.md` — reframe as `graph-*-long`, the legacy form; cross-link the new doc. Keep the format documentation intact: it stays supported, and it is published on the core panel page.
- `data-plane/README.md` — add the new rows to the Models table; correct the standing claim that node graph is _the_ out-of-contract kind.
- `docs/relations-data-sources.md` — add the zero-reshape Prometheus/Loki/Tempo path and the `rowsToFields` recipe; retain the SQL Expression path for the legacy form.
- `todo/relations-item-overrides.md`, `todo/relations-data-links.md`, `todo/relations-color-schemes.md` — add a resolution note to each, marking which gaps the contract closes and which it leaves open. Do **not** delete them: the colour-dispatch bug still needs fixing for hierarchy, which shares the byte-identical guard.
- `src/modules/relations/parity.md` — note which "Inert" / "No" rows the contract change flips.

## Implementation Steps

### Task 1 — Validate the load-bearing assumptions in a running instance

Everything later depends on these. None is expensive; all are currently unverified _in practice_ even where the source reading is clear.

1. **`rowsToFields` emits labels for unmapped columns.** Take the existing `id,source,target,mainstat` CSV in `provisioning/dashboards/relations/sankey.json`, apply `convertFieldType` then `rowsToFields`, and inspect: expect one numeric field per edge, named from `id`, with `labels: {source, target}`. Also record whether the output is a **1-row** frame, which the docs imply — this decides whether a range-shaped source needs a different path.
2. **What the override picker actually shows.** `nameMatcher.ts` confirms `byName` matches raw name _or_ display name, and `getFieldDisplayName` folds a single shared label key down to its value while two keys format as `{source="a", target="b"}`. Confirm empirically what appears in the picker for both the node case (one label) and the edge case (two labels), then save, reload, and confirm the override still matches. This decides how firmly the contract must mandate a meaningful `field.name`.
3. **`getFieldDisplayValues` does not truncate in Calculate mode.** `relations-color-schemes.md` rejects it partly on a 25-item cap. Source reading puts the cap inside the `reduceOptions.values === true` branch only (`fieldDisplay.mjs:136`), so Calculate mode over 500 node fields should be uncapped. Confirm with a wide fixture; this decides whether the reduce path can be `getFieldDisplayValues` or must be a lighter bespoke reduce.
4. **`configFromQuery` reach.** Confirm which properties it can set (docs claim Min/Max/Unit/Thresholds). This determines how much node metadata stays data-driven, which is the sharpest objection to the whole design.

Record each result in the contract doc with the Grafana version tested. **If (1) or (2) fails, the cost model changes** and the contract should be re-proposed with the field-name-split form as primary and a `renameByRegex` reshaping step.

### Task 2 — Write `data-plane/graph-wide.md`

Must include: role resolution precedence and what each signal survives; both frame specs with the full field-config mapping; the `reduceOptions` contract (`calcs[0]` = main stat, `calcs[1]` = secondary — the natural replacement for the two stat columns, and a small improvement on pie's truncate-to-one); the single-frame prefix variant; the `byName`-matches-display-name and `byRegexp`-matches-display-name-only behaviours; the ECharts mapping for `graph`/`sankey`/`chord`, carrying over the pitfalls in `node-graph.md:226-271` that are ECharts-inherent (the unguarded sankey DAG throw, self-loops, the sankey `value` floor, sankey labelling from the node key) and dropping the ones the contract eliminates.

It must also carry all six [worked examples](#worked-examples-legacy-vs-wide-as-csv) verbatim as side-by-side legacy/wide CSV, plus `toDataFrame` equivalents for a Prometheus-shaped response, a `rowsToFields` output and the prefix variant. Three statements from those examples are normative and must appear as rules, not asides:

- Cycle and self-loop handling is **unchanged** — an ECharts constraint, not a contract one.
- **Parallel edges cannot be expressed in direct wide CSV**; they require labels.
- A `byName` override on an adjacency-matrix column targets **the node**, not its inbound edges.

### Task 3 — Build the proof dashboard

`provisioning/dashboards/relations/graph-wide.json` must demonstrate, visibly: per-node colour via a single `byName` override; per-edge colour via a single `byName` override; a data link on exactly one node; a `custom.hideFrom` override hiding exactly one edge; and unit/decimals differing between two nodes. These five are precisely what is impossible today.

Use the worked examples as the fixtures rather than inventing new data — they are already minimal, they cover DAG / cyclic / self-loop / dense, and reusing them keeps the doc and the dashboard from drifting. Include both the edge-per-field and adjacency-matrix forms of example 5 so the dense trade-off is visible side by side, and one `rowsToFields` panel over the existing legacy CSV in `provisioning/dashboards/relations/sankey.json` to prove the migration path end to end.

### Task 4 — Write `todo/graph-wide-migration.md`

The rewrite plan. Key contents: the `legacyToWide` adapter contract and its placement at the frame boundary; the `dataFormat: 'auto' | 'legacy' | 'wide'` panel option and its default; a capability matrix stating plainly that legacy input keeps legacy capabilities, because in-panel adaptation runs after override application; per-gap disposition for all three relations todo docs; and the phase order — adapter and internal model first, then the wide reader, then delete the colour resolver, then the custom config, then the docs.

**One decision this task must settle: how to implement the adapter.** Two options, and the cheaper one is not obviously the right one.

_Hand-rolled_ — `legacyToWide(frames): DataFrame[]`, a pure synchronous function. More code, but it drops straight into the existing call path and into plain jest tests.

_Delegated_ — `transformDataFrame([{ id: 'rowsToFields', options }], frames)`. Much less code and it inherits core's semantics for free, but it carries three costs the plan should weigh rather than discover:

- **Async.** It returns `Observable<DataFrame[]>` and registry items resolve through `() => Promise<DataTransformerInfo>`. The converter path is synchronous today, and `buildOption` is called up to four times per render — threading an Observable through it is a real architectural change, not a free win.
- **The registry is a host concern.** `standardTransformersRegistry` is empty in `@grafana/data` and filled by Grafana core. Under jest there is no host, so `getIfExists('rowsToFields')` returns `undefined` and the adapter silently no-ops — the converter tests would need the transformers registered in `jest-setup.js` or mocked.
- **Invisibility.** A panel-invoked transform does not appear in the Transform tab, so a user debugging a wrong-looking graph sees data reshaped by something they cannot inspect.

A third option is worth considering and may be better than either: **do not adapt silently.** Detect legacy frames and surface a panel notice — "this data is in the legacy row format; add a _Rows to fields_ transformation to enable per-node overrides" — which is honest about the capability difference, keeps the reshaping visible and editable, and needs no adapter at all for the override story. Reserve the adapter purely for _rendering_ legacy data, which is all it can ever do well.

### Task 5 — Update the surrounding docs

The six **Modify** entries. Small and mechanical, but they are what stops the repo carrying two contradictory contracts.

## Out of scope

Explicitly deferred, each needing its own plan:

- **The relations rewrite itself.** Planned by Task 4, executed separately.
- **A core `graph-*-long` → `graph-*-wide` transformation.** Task 1 may show `rowsToFields` already covers it, in which case this reduces to documentation.
- **A core `graph-*-wide` → legacy transformation**, so the existing node graph panel can consume new-format frames. This is the interop direction the brief calls out and the one that genuinely needs new core code.
- **Minting `DataFrameType.GraphNodesWide` / `GraphEdgesWide`** and publishing the kind at grafana.com/developers/dataplane. Worth doing once the contract has shipped in a plugin and been proved; the plugin does not need it to work.
- **Applying the same pivot to hierarchy** (which shares the identical broken colour guard) and to the other families named in `relations-item-overrides.md` option 4.

## Acceptance Criteria

1. `data-plane/graph-wide.md` exists and specifies, for both roles: resolution precedence, required and optional elements, and a mapping row for **every** field in `data-plane/node-graph.md`'s edges and nodes tables — each either mapped to a field-config property or listed with a stated reason for being dropped.
2. Each of the four Task 1 assumptions is recorded in that doc as **confirmed** or **refuted**, with the Grafana version tested and the observed behaviour — not inferred from types.
3. `provisioning/dashboards/relations/graph-wide.json` loads in the devenv and renders all five demonstrations from Task 3, each visibly different from an adjacent unstyled control panel.
4. Those five are achieved with **zero** entries under `options.relationsItemRules` or any other plugin-local per-item mechanism — only `fieldConfig.defaults` and `fieldConfig.overrides`.
5. `todo/graph-wide-migration.md` contains a capability matrix covering every row of the "What this buys" table plus every field in `node-graph.md`, marking each **closed**, **closed for wide input only**, or **still open**.
6. Every gap in the three relations todo docs has an explicit disposition in that matrix. Gap 4 of `relations-data-links.md` (derived nodes carry no row) is expected to remain **partially open** — a node derived from edges has no field, so it can hold no override — and the matrix must say so rather than claim a clean sweep.
7. The contract doc carries all six worked examples as side-by-side legacy/wide CSV, and states the three normative rules from Task 2 (cycles unchanged, parallel edges need labels, matrix columns are nodes) as rules rather than asides.
8. Every wide CSV example in the doc has been pasted into a `csv_content` TestData query and confirmed to render — no example ships unverified.
9. No file under `src/` is modified by this plan.

## Verification Steps

- **Devenv render.** `docker compose up` per `DEVELOPMENT.md`, then load the new dashboard. The container serves `./dist`, so build before any browser check and confirm no other checkout is holding port 3001.
- **Inspector, not screenshots, for the frame claims.** For each panel, open Inspect → Data and confirm field names, `labels` and applied `config`. A screenshot cannot show that a label survived `rowsToFields`.
- **Override round trip.** Add a `byName` override in the editor, save, reload, confirm it still matches. This is what catches an unstable label-derived display name.
- **Scale check.** Point one panel at TestData `node_graph` `response_medium` through `rowsToFields` and confirm the override picker stays usable and the panel renders. Record the field count at which it degrades; the contract doc must state a practical ceiling.
- **No regression.** `pnpm test` and `pnpm typecheck` unchanged, since `src/` is untouched. Note that lefthook auto-writes canvas snapshot baselines on commit — check `git status` before committing so no baseline is silently rewritten.
- **Doc cross-links resolve.** Every relative link added or changed under `data-plane/` and `docs/` points at a file that exists.

## Risks & Mitigations

**`rowsToFields` may not emit labels as documented.** The single assumption the cost model rests on — it is what makes the forward path need no core code. _Mitigation:_ Task 1 tests it before any doc is written. If it fails, the field-name-split form becomes primary and the plan gains a `renameByRegex` step; the contract survives, the sourcing story gets worse.

**Two-label edge fields display as `{source="a", target="b"}`.** Verified in `getFieldDisplayName`: the friendly single-label folding only applies when one label key is shared across all frames. An edge with two keys gets the raw format, which is what the override picker would show if `field.name` is missing or `Value`. _Mitigation:_ the contract makes `field.name` the edge identity and requires it to be meaningful; `rowsToFields` with `id` as Field name satisfies this by construction. Task 1 step 2 confirms the picker text.

**Field-count explosion on large graphs.** A 500-node topology is 500 fields plus up to |E| more; `applyFieldOverrides` is O(fields × rules) and the picker is a combobox over all of them. _Mitigation:_ the scale check, a stated ceiling in the contract, and guidance to prefer `byRegexp` at scale. This is the same regime as any high-cardinality Prometheus panel — a known-acceptable cost, not a new one.

**Dense graphs are pathological in the edges-wide form.** Worked example 5 makes it concrete: 3 nodes need 6 edge fields, and a dense 30-node chord needs 870. _Mitigation:_ document the adjacency-matrix form (a row key field of source nodes plus one field per target node — producible today by core's `groupingToMatrix`) as the dense alternative, with its trade-off stated honestly: node overrides work, per-edge overrides are not addressable because an edge is a cell.

**Parallel edges are a genuine capability regression in direct wide CSV.** Two edges over the same pair are legal today (two rows, distinct `id`) but cannot be two identically named fields — `getUniqueFieldName` silently renames the second to `a->b 2`, which both changes the override target and breaks name-based endpoint parsing. _Mitigation:_ the labelled form handles it cleanly (names stay `e1`/`e2`, endpoints live in labels), so the contract states plainly that parallel edges require labels and the `legacyToWide` adapter emits id-named fields with labels rather than name-split fields whenever it detects a duplicate pair. This is the one shape where the wide form is strictly harder to author than the legacy one, and the doc should say so.

**Node/edge metadata moves from data to configuration.** `title`, `icon`, `subtitle` become field config, so a topology whose membership changes cannot carry per-node metadata from the query as easily as a `title` column does. This is the sharpest real objection. _Mitigation:_ `field.labels` carries query-derived attributes, `configFromQuery` drives config from a second query (Task 1 step 4 establishes its reach), and `thresholds`/`mappings` cover the common colour-by-health case better than the current `color` column — whose numeric form is specced but unimplemented anyway.

**Two contracts coexisting is more complexity, not less, until legacy is dropped.** _Mitigation:_ the architectural rule in Task 4 — one internal model, one adapter at the frame boundary. Legacy costs exactly one function, and its removal is that function's deletion.

**This makes #129905 look redundant when it is not, entirely.** The wide contract solves graph frames, and by the same argument pie and hierarchy. It does not solve marks that are irreducibly not fields — canvas elements, geomap features — which #129905's own plan doc names as fellow travellers. Two further findings should be stated fairly in the contract doc rather than buried: core already ships **`ValueMatcher`** (`(valueIndex, field, frame, allFrames) => boolean`) with a registry, unwired from the override engine; and it already shipped **`MatcherScope`** (`'series' | 'nested' | 'annotation' | 'exemplar'`) with `MatcherScopeSelector` in `@grafana/ui` and a `scope` parameter on `applyFieldOverrides`. A `'node'`/`'edge'` scope is a far smaller core ask than a parallel override system. _Mitigation:_ the honest claim is "graph frames do not need item overrides", not "nothing does" — and if a core change is wanted anyway, `MatcherScope` is the cheaper door. Overstating the result would weaken a proposal that may still be right for the remaining cases.
