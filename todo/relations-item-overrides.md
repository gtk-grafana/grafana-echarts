# Per-item (node / edge) options for the relations family

How should a user say "colour **eu-west** red", "link **us-west → us-east** to a trace", or
"make **that one** edge curved"? Today they cannot. This is the shared design question
behind [relations-data-links.md](./relations-data-links.md) and
[relations-color-schemes.md](./relations-color-schemes.md); both stop at the same wall and
defer to this doc.

Everything below was verified against Grafana 13.1.0 and ECharts 6 in a running instance,
not inferred from types alone.

> ## Resolution — the question is dissolved, not answered, and it has shipped
>
> **Nothing in this doc was built, and nothing in it needs to be.** All six phases of
> [graph-wide-migration.md](./graph-wide-migration.md) shipped without a single
> plugin-local per-item mechanism: colour, style, visibility, tooltip formatting and
> `config.links` are each an ordinary `byName` override on the mark's own field. The
> worked demonstration on the relations panel itself is
> `provisioning/dashboards/relations/graph-wide.json` (each row pairs a core panel with
> the relations panel reading the same fixture and the same overrides) and
> `provisioning/dashboards/relations/per-mark-tooltip-links.json`.
>
> **The recommendation below (option 1, `options.relationsItemRules`) is superseded and
> should not be built.** Every option in this doc assumes the mark stays a frame **row**.
> [../data-plane/graph-wide.md](../data-plane/graph-wide.md) makes it a **field** instead
> — `graph-nodes-wide` / `graph-edges-wide`, one node per field and one edge per field —
> at which point "colour `eu-west` red" is an ordinary `byName` override with no new
> editor, no new schema and no core change. Demonstrated in
> `provisioning/dashboards/relations/graph-wide.json`, which achieves per-node colour,
> per-edge colour, a link on exactly one node, `custom.hideFrom` on exactly one edge, and
> differing units on two nodes using `fieldConfig.overrides` alone.
>
> **What in this doc is now wrong:**
>
> - The recommendation. Option 1 is not needed for this family. Nothing in the proof
>   dashboard uses a plugin-local per-item mechanism.
> - The "is the field override UI useless" table: every **No** becomes a **Yes** for wide
>   input, including `custom.hideFrom` and "anything targeting one node or one edge".
> - The first open question — _should an item rule beat a data-driven `color` column_ —
>   dissolves. There is no second rule system, and `rowsToFields` converts a legacy
>   `color` column into `config.color.fixedColor`, where a field override beats it exactly
>   as it does in every other Grafana panel.
>
> **What in this doc is still correct and still load-bearing:**
>
> - "Why the obvious route is closed" — all of it. `FieldMatcher` is still
>   `(field, frame, allFrames) => boolean`; the matcher list is still five entries
>   (re-confirmed on 13.1.0: `byName`, `byRegexp`, `byType`, `byFrameRefID`, `byValue`);
>   `fieldMatchersUI` is still a global singleton. The wall is real — the pivot walks
>   around it rather than through it.
> - "What is actually per-item in ECharts". Sankey `nodeWidth` / `nodeGap` are still
>   series-level and must stay panel options however marks are modelled.
> - Option 4's framing, narrowed: graph frames do not need
>   [#129905](https://github.com/grafana/grafana/pull/129905), and by the same argument
>   nor do pie or hierarchy — but canvas elements and geomap features are marks that
>   cannot be fields, so the general case survives. If a core change is wanted anyway,
>   the cheaper door is **`MatcherScope`**, which already ships (`'series' | 'nested' |
'annotation' | 'exemplar'`, plus a `scope` parameter on `applyFieldOverrides` and a
>   `MatcherScopeSelector` in `@grafana/ui`) and which the override editor already writes
>   into dashboard JSON — observed as `scope: 'series'` in a saved 13.1.0 dashboard.
>   A `'node'` / `'edge'` scope is a far smaller ask than a parallel override system.
>
> Rewrite plan and per-gap disposition:
> [graph-wide-migration.md](./graph-wide-migration.md).

## Is the field override UI useless for relations?

**No — and it should not be hidden.** It is _field_-scoped, which covers rather more than it
first appears:

| Surface                                                              | Works?          | Evidence                                                                                              |
| -------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Standard options in **Defaults** (Unit, Decimals, Min/Max, No value) | Yes             | `unit: bytes` in defaults renders node values as `1.2 KiB` / `800.0 B`                                |
| `byName` **override** on a real field (`mainstat`)                   | Yes             | Same result via `Override 1 → Fields with name → mainstat → Unit`                                     |
| Color scheme                                                         | Partly          | Only 2 of 8 modes reach the chart — see [relations-color-schemes.md](./relations-color-schemes.md)    |
| Data links on a field                                                | Yes, but global | The link paints on **every** node, not one — see [relations-data-links.md](./relations-data-links.md) |
| `custom.hideFrom` ("Hide in area") as an override                    | **No**          | A `byName` override can only name a field; applying it to `mainstat` hides nothing                    |
| Anything targeting **one node or one edge**                          | **No**          | The matcher cannot express a row                                                                      |

So the honest split is: field-scoped presentation of the _stat columns_ works and is worth
keeping; per-mark styling is entirely absent.

**Already changed:** the one control that was purely misleading is gone. `custom.hideFrom` is
still registered — Grafana discards override properties no plugin declared, and the legend
toggle's override would otherwise be thrown away — but now via `addHiddenSeriesHideFrom`
(`lib/grafana/editor/common/fieldConfig.ts`) with both `hideFromDefaults` and
`hideFromOverrides` set, so no editor is reachable. Verified: the override property list is
now `Unit, Min, Max, Field min/max, Decimals, Display name, Color scheme, No value, Data
links, Actions, Value mappings, Thresholds, Filterable` — no "Hide in area" — and the legend
toggle still hides a node.

## What is actually per-item in ECharts

Worth pinning down before designing an editor, because two of the options named in the
request cannot be per-node at all.

| Variant  | Per-**node**                                                                                                      | Per-**edge**                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `graph`  | `itemStyle` (colour, border), `label`, `symbol`, `symbolSize`, `x`/`y`/`fixed`, `category`, `draggable`, `cursor` | `lineStyle` (colour, width, type, opacity, **curveness**), `label`, `symbol`/`symbolSize` (arrowheads), `ignoreForceLayout` |
| `sankey` | `itemStyle`, `label`, `localX`/`localY`/`depth`, `draggable`                                                      | `lineStyle` (+ **curveness**), `edgeLabel`                                                                                  |
| `chord`  | `itemStyle`, `label`                                                                                              | `lineStyle` (+ **curveness**), `label`                                                                                      |

Two consequences:

- **Per-edge curveness is available on all three variants** (`GraphEdgeLineStyleOption`,
  `SankeyEdgeStyleOption`, `ChordEdgeLineStyleOption` each extend `LineStyleOption` with
  `curveness`). So that request is satisfiable.
- **Sankey node width and node gap can never be per-node.** They are series-level
  (`series.sankey.nodeWidth` / `nodeGap`) and have no item-level counterpart. They must stay
  panel options. The nearest per-node equivalents are `localX`/`localY`/`depth` (placement,
  not size). Node _size_ is per-item only on `graph`, via `symbolSize` — which the converter
  already honours from `noderadius`.

## Why the obvious route is closed

- **The matcher list has no row concept.** Empirically the override matcher choices are
  `byName`, `byRegexp`, `byType`, `byFrameRefId`, `byValue` — and `byValue` is a _reducer over
  a field_, not a row selector.
- **`byName` only offers field names.** On a relations panel the picker lists exactly
  `id, source, target, mainstat`. `FieldNameMatcherEditor` builds options from
  `useFieldDisplayNames(data)` and its `onChange` hard-rejects anything else
  (`if (!frameHasName(...)) return;`), so a node name cannot even be typed in. Hand-written
  JSON renders as "gateway (not found)".
- **`FieldMatcher` is structurally field-shaped**: `(field, frame, allFrames) => boolean`.
  There is nowhere to put a row index, so even a custom matcher could not be _applied_ by
  Grafana's override engine — a plugin would have to apply it itself.
- **`fieldMatchersUI` is exported but is a global singleton.** Registering "Nodes with id"
  from a plugin would add it to every panel's override list in the app.

## Options

### 1. Item rules in **panel options** (plugin-local, no core change)

A custom panel-option editor holding a list of rules:

```ts
interface RelationsItemRule {
  /** Which marks this rule can touch. */
  target: 'node' | 'edge' | 'both';
  /** How to select them. */
  matcher:
    | { id: 'byId'; options: string[] } // node ids / edge ids, multi-select from data
    | { id: 'byRegexp'; options: string } // matches node name or `source → target`
    | { id: 'all' };
  properties: {
    color?: string;
    links?: DataLink[];
    symbolSize?: number; // graph nodes only
    lineWidth?: number; // edges only
    curveness?: number; // edges only
    lineType?: 'solid' | 'dashed' | 'dotted'; // graph edges only
  };
}
```

Stored at `options.relationsItemRules`, applied in `toNodeItems` / `toLinkItems`, which
already build exactly these item objects.

**Precedent is strong and recent.** Core's **XY chart** puts per-series config in _panel
options_, not fieldConfig — `Options: { series: [...XYSeriesConfig] }` — and each entry even
embeds a copy of `#MatcherConfig`, the matcher shape from the dashboard schema
(`public/app/plugins/panel/xychart/panelcfg.cue`, wired via `addCustomEditor({ id: 'series',
editor: SeriesEditor })`). Geomap layers and Canvas elements follow the same pattern. So
"per-item config lives in options with a matcher-shaped selector" is the direction core
itself took the last time it hit this problem.

- **Pros:** ships without core; the editor receives `context.data` so the id picker can be a
  real multi-select of actual nodes/edges; `target: node | edge | both` answers the "select
  edges and/or nodes" requirement directly; `DataLinksInlineEditor` is exported from
  `@grafana/ui`, so links reuse the exact core editor users know.
- **Cons:** a second overrides UI living next to the field one; no interop with
  transformations or with core override tooling; needs its own migration handler; every
  future row-based family reinvents it.

### 2. Data-driven columns only

Lean harder on the node-graph field spec — `color`, `noderadius`, `thickness`,
`strokedasharray` are already read — and add more columns.

- **Pros:** zero UI; composes with SQL Expressions and transformations; already the spec's
  own idiom.
- **Cons:** styling one node means editing a query (`CASE WHEN id='eu-west' THEN '#ff0000'`).
  Cannot express data links at all. Undiscoverable. Fine as a complement, not a solution.

### 3. Core: plugin-scoped custom matcher UI

Make `fieldMatchersUI` filterable per panel (e.g. `PanelPlugin.setSupportedMatchers([...])`,
or a `scope` on the registry item) so a plugin can contribute "Nodes with id" without
polluting other panels.

- **Pros:** small core diff; reuses the override UI shell and persistence.
- **Cons:** dishonest — the engine still cannot _apply_ it, so the plugin applies it anyway
  and the override list gains an entry that behaves unlike every other entry. Buys the UI
  without the semantics.

### 4. Core: first-class row / item overrides

A sibling to `fieldConfig.overrides` for visualizations whose marks are rows. Core supplies
the editor shell, matcher UI over the values of a declared key field, and storage; the plugin
declares its item kinds (`node`, `edge`) and the properties each supports, and applies them.

- **Pros:** the right abstraction, and not just for relations — pie/funnel slices, canvas
  elements, geomap features, state-timeline rows all want it. UX matches the override editor
  users already know. Would retire the by-name hacks in `seriesConfig.ts`.
- **Cons:** largest core change; needs schema, migration and dashboard-JSON design; needs
  buy-in and a maturity path.

### 5. Core: let the field selector operate on row values

The "field selector UI works on rows" idea: a per-plugin flag (say `overrideScope: 'rows'`
plus a `rowKeyField` hint) that makes `FieldNameMatcherEditor` populate from the _values_ of
the key field.

- **Pros:** smallest core diff of the core-side options; reuses the entire existing UI,
  storage and "+ Add field override" affordance; the plugin already applies these itself, so
  little else changes.
- **Cons:** the override is still stored under matcher id `byName`, whose documented meaning
  is "a field" — so the dashboard JSON lies to every other reader (provisioning linters,
  migrations, the schema). Minting an honest `byRowValue` id fixes that and lands back at
  option 3/4. Also does not solve node-vs-edge selection: relations needs _two_ row
  universes, and one key field cannot express that.

## Recommendation

**Ship option 1 now; take option 4 to core as the follow-up.**

Option 1 is the only one that satisfies the whole request today — node _and_ edge selection,
colour, links, and per-edge curveness — and it is the pattern core reached for in XY chart,
so it is not a detour. Building it also forces us to discover the real property surface,
which is the part any core proposal will need to justify itself.

Design it so the stored shape is a deliberate analogue of `ConfigOverrideRule`
(`{ matcher: { id, options }, properties: [...] }`). If core later gains row overrides, the
migration is then mechanical rather than a rewrite.

Explicitly **not** recommended: option 3 alone (UI without semantics), and option 5 as
literally described (`byName` meaning two different things depending on panel).

## Concrete next steps

1. Decide node/edge scope in the rule model: one list with a `target` selector (simpler UI,
   properties must be filtered per target) vs two lists, "Node rules" / "Edge rules" (clearer,
   more chrome). Lean toward one list with a segmented `target` control.
2. Build `RelationsItemRulesEditor` as `addCustomEditor`, with the id multi-select populated
   from `frameToNodeGraph(ctx.data)` so users pick real nodes/edges rather than typing ids.
3. Apply in `toNodeItems` / `toLinkItems` (`options/graph.ts`, `sankey.ts`, `chord.ts`) — one
   resolver shared by all three variants, layered _over_ the existing precedence (fixed-colour
   override → data `color` column → by-value scheme → palette).
4. Route per-item links into the tooltip footer alongside the field-derived ones, once
   [relations-data-links.md](./relations-data-links.md) gaps 2–4 are closed.
5. Fix the color-scheme dispatch first ([relations-color-schemes.md](./relations-color-schemes.md)) —
   per-item colour sits on top of it, and stacking a new feature on a broken base will make
   both look wrong.
6. Add a provisioned demo dashboard, and only then write the core proposal, with the shipped
   editor as the worked example.

## Open questions

- Should an item rule beat a data-driven `color` column, or lose to it? (Field overrides beat
  data in core; the node-graph spec treats `color` as authoritative. They conflict.)
- Do rules need to survive a node id changing between refreshes? Regex matching partly
  answers this; id matching does not.
- Is `both` a useful target, or does every real property belong to exactly one of node/edge?
- Should this generalise to the hierarchy and part-to-whole families in this repo before any
  core proposal, to prove the abstraction on three families rather than one?
