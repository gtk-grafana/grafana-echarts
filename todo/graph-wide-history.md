# Design history — `graph-nodes-wide` / `graph-edges-wide`

> **A working record, not the specification.** The spec is
> [data-plane/graph-wide.md](../data-plane/graph-wide.md); the row form it replaced is
> [data-plane/graph-long.md](../data-plane/graph-long.md). What is kept here is the
> evidence and reasoning behind the contract — what was measured in a running Grafana,
> what was considered and rejected, and what the pivot costs. Read the spec first; come
> here for _why_ a rule says what it says.

The contract is **field-based**: **one node is one field, one edge is one field.** Values
are the mark's weight over the frame's row dimension; identity is `field.name`; topology is
in `field.labels`; everything else — colour, unit, decimals, thresholds, mappings, data
links, per-mark style — is ordinary `fieldConfig`.

The kind is **proposed, not minted.** `DataFrameType` in `@grafana/data` 13.1.1 has twelve
members and none is graph-related, so nothing was redefined; the published contract spec
explicitly invites new kinds and puts one at `meta.typeVersion` **`[0, 1]`** until it
stabilises.

The **row** format stays supported — it is what Tempo, AWS X-Ray and TestData emit
natively, and it is published on the core Node graph panel's
[Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).
The relations panel reads the wide contract only; `legacyToWide` converts the row form
above the panel, registered via `PanelPlugin.setDataTransformations` so it runs before
`applyFieldOverrides` — the placement that makes every mark an override target.

## Why fields rather than rows

`todo/relations-item-overrides.md` (since resolved) documented the wall: Grafana's override
matcher is `FieldMatcher = (field, frame, allFrames) => boolean`, so it cannot address a
row. A long node-graph frame makes every node and every edge a row, which is why "colour
`eu-west` red" and "link `us-west → us-east` to a trace" were inexpressible, and why five
escape routes were enumerated — four of them needing core changes.

Making the mark a **field** dissolves the question instead of arbitrating it, because a
field is the unit Grafana's whole configuration pipeline already addresses. The pivot is
not novel in this repo: [part-to-whole](../data-plane/part-to-whole.md) already made it,
deleting its long-format path so one field = one slice.

Today's nodes and edges frames are not a novel kind either. They are ordinary
**`numeric-long`** frames with reserved column names: `source`/`target` are dimension
columns and `mainstat` is the value column. So this is the same data, read the way the
data plane already reads long-vs-wide everywhere else.

## Verified behaviours

Everything the cost model rests on, checked in a running instance rather than inferred
from types. **Grafana 13.1.0** (commit `b309c9b`, enterprise), `@grafana/data` 13.1.1,
ECharts 6.1.0. Probes ran against the host's own module graph
(`System.import('@grafana/data')`) and, where the claim is about UI, against the real
override editor.

| #   | Assumption                                                  | Verdict                                                 | Observed                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `rowsToFields` emits labels for unmapped columns            | **Confirmed — and stronger**                            | On the canonical `id,source,target,mainstat` CSV it needs **zero options**: auto-detection takes the first `string` field as the name and the first `number` field as the value, and every other column becomes a label. Output: one numeric field per edge, `labels: {source, target}`.        |
| 1a  | `rowsToFields` output row count                             | **Confirmed: always 1 row**                             | `{ fields, length: 1, refId: 'rowsToFields-<refId>' }`. It reduces nothing — one row **in** becomes one field with one value.                                                                                                                                                                   |
| 1b  | `rowsToFields` on untyped CSV                               | **No-op**                                               | With no numeric field it returns the input frame unchanged (`if (!nameField \|\| !valueField) return data`). A `csv_content` fixture therefore **requires** `convertFieldType` first.                                                                                                           |
| 1c  | Legacy config columns                                       | **Confirmed bonus**                                     | Columns named `color`, `unit`, `min`, `max`, `decimals` auto-map to **real field config** (`color` → `{fixedColor, mode:'fixed'}`), because auto-detection looks the lowercased column name up in `configMapHandlers`. A legacy `color` column becomes an override-able, theme-resolved colour. |
| 2   | What the `byName` picker lists                              | **Confirmed — with a correction**                       | The display name is **`name` + `' '` + labels**, not labels alone: `e1 {source="gateway", target="api"}`. The picker lists that **and** the raw name as a second entry, `e1 (base field name)`.                                                                                                 |
| 2a  | Override round trip                                         | **Confirmed**                                           | Picking the base-name entry persists `{matcher:{id:'byName', options:'e2', scope:'series'}}`; after save + hard reload it still matches (no `(not found)`), and the property applies.                                                                                                           |
| 2b  | Display-name stability                                      | **Refuted — names are not stable**                      | A nodes frame alone shows `a Gateway` (single shared label key folds to its value). Add an edges frame and the same field becomes `a {title="Gateway"}`, because `getSingleLabelName` scans **every** frame. Only `field.name` is stable.                                                       |
| 2c  | Override matcher list                                       | **Confirmed: five, no row concept**                     | `Fields with name`, `… name matching regex`, `… with type`, `… returned by query`, `… with values`.                                                                                                                                                                                             |
| 3   | `getFieldDisplayValues` does not truncate in Calculate mode | **Confirmed**                                           | 500 numeric fields → **500** entries with `values: false`; **25** with `values: true` (`DEFAULT_FIELD_DISPLAY_VALUES_LIMIT`). The `hitLimit` check exists only inside the All-values branch. Two calcs over four fields → 8 entries.                                                            |
| 4   | `configFromQuery` reach                                     | **Confirmed — wider than documented, but not per-node** | Sets `min`, `max`, `unit`, `decimals`, `displayName`, `color` (fixed), `thresholds` (one step, colour from `handlerArguments`) and value mappings. **Not** data links, **not** `custom.*`. Its config frame is reduced to **one row**, so every field `applyTo` matches gets the _same_ config. |

Two further behaviours decided the design, not just its cost:

| Behaviour                                 | Observed                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.state.range` contamination         | A legacy nodes frame with `mainstat` (12, 8), `noderadius` (40, 60) and `arc__ok` (0.9, 0.5) gives **every** field `{min: 0.5, max: 60}`. The wide equivalent gives `{min: 8, max: 12}` — node values only.     |
| Fixed colours are theme-resolved upstream | A `byName` override of `dark-red` reaches the field as `config.color.fixedColor: 'dark-red'` and `field.display(v).color` returns `#C4162A`. No `theme.visualization.getColorByName` call is needed downstream. |

## Could the endpoints be carried by labels alone?

Labels were made normative and name-splitting (`-->`) demoted to an authoring shortcut, but
dropping name-splitting entirely was a live option, since almost every property favours
labels:

| Dimension                        | Labels                                                                             | Name-split                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Authorable in raw CSV            | Only via a JSON column + **Extract fields** (see `docs/relations-data-sources.md`) | **Yes** — one header line, no transformations                                      |
| Parallel edges                   | **Yes** — ids stay distinct, endpoints repeat                                      | **No** — see [worked example below](#worked-example-parallel-edges-require-labels) |
| Separator collision              | Immune                                                                             | Possible (`a-->b-->c`)                                                             |
| Identity independent of topology | **Yes** — rename an edge without moving it                                         | **No** — `field.name` does double duty                                             |
| Prometheus / Loki, zero reshape  | **Native** — `client` / `server` arrive as labels                                  | Needs a `legendFormat` to build the name                                           |
| SQL / CSV via `rowsToFields`     | **Native** — unmapped columns become labels                                        | Needs the id column to be pre-concatenated                                         |
| Reader cost                      | —                                                                                  | ~15 lines and one precedence rule                                                  |
| Doc / fixture cost               | Every example needs a transform pipeline                                           | Every example is one CSV line                                                      |

**Decision: keep both, with labels normative and name-splitting explicitly demoted.** The
deciding argument was not the 15 lines of reader code — it was that a contract nobody can
write down by hand is a contract nobody checks. Every worked example in the spec is a
pasteable CSV, and the proof dashboard renders from CSV; labels-only would push every one
of them behind a multi-transformation pipeline whose own behaviour then has to be trusted.
A JSON-column recipe (Extract fields → Organize → Convert field type → Rows to fields,
documented in `docs/relations-data-sources.md`) proves labels are reachable from any
datasource, so nothing is capability-blocked by keeping the shortcut.

The demotion is what keeps this from being ambiguity — normative rules, unchanged since:

1. **Labels are the conformant carrier.** A datasource or transformation emitting this kind
   MUST use labels. `legacyToWide` MUST emit labels.
2. **Name-splitting is a `csv_content`-class authoring shortcut**, permitted so fixtures and
   documentation stay writable. Readers MUST support it, MUST prefer labels when both are
   present, and MUST use first-separator-wins.
3. Its two limitations are **normative, not incidental**: it cannot express parallel edges,
   and a node id containing `-->` is not representable.

## Single-frame prefix variant — considered, not adopted

For sources that can emit neither `meta` nor labels and cannot run two queries, one frame
could carry both roles using field-name prefixes:

```csv
node__a,node__b,node__c,edge__a-->b,edge__b-->c
12,8,3,420,380
```

`node__` and `edge__` (double underscore, matching the row form's `arc__` / `detail__`
idiom) would split the frame into the two roles; the remainder of the name is the id.

**Rejected**, for two measured reasons: the prefix leaks into the override picker (every
entry reads `node__a` unless each field also sets `displayName`, which defeats the point of
the shortcut), and it destroys the zero-reshape Prometheus and `rowsToFields` paths, both
of which produce clean ids already. Nothing in the plugin reads a prefix, and the spec does
not define one.

## The `reduceOptions` contract

The family deliberately does **not** register Grafana's standard Value options
(`addStandardDataReduceOptions`) — that helper also adds "Show: Calculate / All values" and
"Limit" controls that cannot mean anything here, since a mark is a field by contract and
there are no rows to limit or expand into. Instead `addRelationsStatOptions`
(`lib/grafana/editor/relations/stats.ts`) registers a custom editor for `reduceOptions.calcs`
alone, with `allowMultiple: true`: `calcs[0]` is the **main stat** — the only number that
sizes or colours a mark, so it is singular by construction — and every calc after it is an
uncapped tooltip row (an earlier version capped the picker at two and the reader silently
dropped `calcs[2..]`; both caps are gone). `reduceOptions.values`, `.limit` and `.fields` are
not read by the reader and have no editor: "all values" would mean one mark per row, which
is not expressible when a mark is a field, and which fields are marks is decided by frame
role, not by a matcher.

Calculate mode is **uncapped** (verified: 500 fields → 500 results), so a wide reduce is
safe at the scale a real topology needs. On a single-row instant frame every reducer that
returns a value returns the same value, so `lastNotNull`, `last`, `mean`, `min`, `max` and
`sum` all agree — the calc only starts to matter once there is a row dimension.

That last sentence has a consequence the "second stat" mapping has to own: **on an instant
frame a secondary stat is not expressible**, because `calcs[0]` and `calcs[1]` reduce the
same single value and return it twice. The long form's `mainstat`/`secondarystat` were two
independent measurements (Tempo: average response time and requests per second); two calcs
over one series are two _views_ of it, not two measurements. So the `calcs[1]`-as-second-stat
mapping is sound only on the **ranged** variant. On instant data a second stat needs a
second carrier: a label, at the cost of its type and unit.

## Identity: the reader never mints an id

`RelationLink.id` is `field.name`, always — including when several collected marks share
it, which is exactly what N raw `Value` frames produce (the Multi row-dimension variant,
[data-plane/graph-wide.md](../data-plane/graph-wide.md)). A synthesised `a-->b` would look
addressable and not be: `byName`/`byNames` compare against `field.name` or the display name,
and neither is a minted string. Worse, the panel's override universe
(`getOverrideTargetNames`) feeds an **exclude** matcher, so an id no field answers to there
stops the kept list covering the edge fields and hiding one node erases every link in the
panel.

What duplication actually breaks is one thing: the tooltip's item-to-field lookup, which
would be last-write-wins keyed by id. The reader mints a **`markKey`** for that — an
internal item key, unique per render, minted from the endpoints, then the label set that
tells parallel edges apart, then `#n` (the same ladder the pivot names fields with). It is
never rendered and never matched against, so its stability bar is far lower than an id's.

What stays lost, and is documented rather than fixed:

- `byName` on the raw name cannot target one edge of a `Value`-named response;
- the override picker lists `Value` once per frame — honest, and ugly;
- `palette-classic-by-name` would hash N same-named fields to one colour. It does not bite
  today: edges discard palette modes entirely, and a node derived from an edge's endpoints
  either has no field at all (the reader's own fallback, still the default since
  `deriveNodes.ts`'s pre-pass is gated behind `panelPluginTransformations`, off by default)
  or, when that pre-pass does run, a distinctly-named one — so no two derived nodes ever
  share a name to collide over.

## Performance: which frame shape is cheapest

Measured in Grafana 13.1.0 in-browser, over synthetic frames of E edges across N nodes.
Each row is one `applyFieldOverrides` pass with 20 `byName` rules, then
`cacheFieldDisplayNames`, then a simulated converter pass resolving every mark's colour
through `field.display`. `JSON kB` is `JSON.stringify` of names + labels + values — a
proxy for payload and serialisation cost, not for heap.

| Marks (edges) | Shape                | Fields | Frame length | JSON kB | `applyFieldOverrides` | display names | per-mark resolve | picker options |
| ------------: | -------------------- | -----: | -----------: | ------: | --------------------: | ------------: | ---------------: | -------------: |
|           100 | long                 |      4 |          100 |       2 |                0.1 ms |          0 ms |           0.1 ms |              4 |
|           100 | wide, edge-per-field |    100 |            1 |       5 |                1.4 ms |        0.3 ms |           0.2 ms |            200 |
|         1 000 | long                 |      4 |        1 000 |      23 |                0.1 ms |          0 ms |           0.3 ms |              4 |
|         1 000 | wide, edge-per-field |  1 000 |            1 |      58 |                6.5 ms |        0.7 ms |           1.2 ms |          2 000 |
|         5 000 | long                 |      4 |        5 000 |     128 |                0.1 ms |          0 ms |           0.9 ms |              4 |
|         5 000 | wide, edge-per-field |  5 000 |            1 |     303 |               18.6 ms |        4.1 ms |           8.1 ms |         10 000 |
|    992 (N=32) | long                 |      4 |          992 |      22 |                0.1 ms |          0 ms |           0.2 ms |              4 |
|    992 (N=32) | wide, edge-per-field |    992 |            1 |      56 |                3.4 ms |        0.6 ms |           1.1 ms |          1 984 |
| 9 900 (N=100) | long                 |      4 |        9 900 |     238 |                0.1 ms |          0 ms |           1.1 ms |              4 |
| 9 900 (N=100) | wide, edge-per-field |  9 900 |            1 |     586 |               20.9 ms |        2.4 ms |          10.4 ms |         19 800 |

**Long is the cheapest per mark, and it is not close.** A mark is a row — four array slots —
so 5 000 edges is still four fields and a 0.1 ms override pass. This is the honest cost of
the pivot: **long is cheap precisely because nothing in it is per-mark configurable.**

**Edge-per-field wide is the most expensive shape**, by roughly 200× on the override pass at
5 000 marks. The cost is structural, not a missing optimisation: `applyFieldOverrides`
builds one display processor per field, and `cachingDisplayProcessor` keys its cache on the
value — so in the long form one processor is reused across 5 000 rows with a warm cache,
while in the wide form 5 000 processors are each called once and the cache never pays.

**ECharts is neutral.** All four relationship series are hand-built — `getInitialData` reads
`option.data`/`nodes`/`links` literally and never goes through `getSource()` — so the same
graph costs ECharts the same to lay out and draw regardless of which frame shape produced
it. The one indirect effect: per-mark config means the converter calls E display processors
instead of one (the `per-mark resolve` column).

### Recommendation by scale

| Regime                                      | Use                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Up to ~500 marks                            | **Edge-per-field wide.** ~3 ms of pipeline for full per-mark configurability is not a trade worth thinking about                            |
| ~500 – 5 000 marks                          | Edge-per-field wide still works (~30 ms per render), but the **picker** is the bottleneck, not the pipeline. Prefer `byRegexp` at this size |
| Above ~5 000 marks with no per-mark styling | **Long.** It stays free, and if nothing is configured per mark there is nothing to gain by pivoting                                         |

The last row is why the contract does not claim the wide form is universally better. It is
better wherever per-mark configuration has any value, and worse wherever it has none.

## Limits and divergences

- **Field-count ceiling — the UI degrades before the pipeline does.** The binding
  constraint is the **override picker**, which lists the display name _and_ the raw base
  name for every field, so a 1 000-edge frame is a 2 000-entry combobox. It is virtualized,
  but on TestData's `node_graph` `response_medium` pivoted through `rowsToFields`, whose
  display names carry four labels each, opening it took **~4 s**. Practical ceiling: a few
  hundred marks per frame, and display-name _length_ matters as much as count. Beyond that,
  prefer `byRegexp` — remembering it tests the _display_ name, so anchor patterns tolerantly
  (`/^db-/`, not `/^db-.*$/` against an id that carries labels).
- **Dense graphs are pathological in the edge-per-field form**: |E| grows as N·(N−1), so a
  30-node chord is 870 fields. The adjacency-matrix variant
  ([data-plane/graph-matrix.md](../data-plane/graph-matrix.md)) trades per-edge overrides
  for a flat field count.
- **Parallel edges cannot be authored in a wide CSV** directly — see the worked example
  below.
- **Metadata moves from data to configuration**, which is the point (it is what makes it
  overridable), but a topology whose membership changes cannot carry per-node metadata as
  cheaply as a `title` column did. Mitigations, in order of usefulness: `rowsToFields` (per
  row, automatic for `color`/`unit`/`min`/`max`/`decimals`), `field.labels` for query-derived
  attributes, `thresholds`/`mappings` for colour-by-health, and `configFromQuery` only where
  one config for many marks is actually wanted.
- **`custom.*` is plugin-declared**, so a wide graph frame rendered by a _core_ panel keeps
  its colours, units, links, thresholds and visibility but not `nodeRadius`, `subtitle`,
  `icon`, `curveness` or `lineType`.

## Worked example: parallel edges require labels

The long form tolerates two rows over the same pair:

```csv
id,source,target,mainstat
e1,a,b,10
e2,a,b,20
```

Three encodings are possible in the wide form; only one is recommended, and the reasons are
measured rather than aesthetic.

**(a) Duplicate field names — legal, individually targetable, but positional.**

```csv
a-->b,a-->b
10,20
```

`getUniqueFieldName` disambiguates only the **display** name, appending an ordinal to every
duplicate, so two fields display as `a-->b 1` and `a-->b 2`. Measured matcher behaviour:

| Override            | Matches                              |
| ------------------- | ------------------------------------ |
| `byName: 'a-->b'`   | **both** fields (it is the raw name) |
| `byName: 'a-->b 1'` | the first only                       |
| `byName: 'a-->b 2'` | the second only                      |

Confirmed in a live panel over `csv_content` of `a-->b,a-->b` / `10,20`: `byName: 'a-->b 2'`
formats the second cell only. But the ordinal is **positional within the frame** — insert a
new parallel edge ahead of an existing one and every subsequent override silently retargets.

**(b) Multiple values in one field — wrong shape.** A field named `a-->b` with values
`[12, 20]` is **one** edge sampled twice, not two edges — that is the ranged row dimension,
a different and legitimate thing. It cannot express two parallel edges, because there is
only one mark to configure.

**(c) Distinct ids with endpoints in labels — recommended.** Keep the ids as names and put
the endpoints in labels, which CSV cannot do, so this shape is `rowsToFields`-only:

```csv
e1,e2
10,20
```

Both fields carry `labels: {source: 'a', target: 'b'}`, display as
`e1 {source="a", target="b"}` / `e2 {source="a", target="b"}`, and `byName: 'e2'` matches
exactly one (measured). Nothing is positional. This is the one shape where the wide form is
harder to author than the legacy one — the `legacyToWide` adapter therefore emits id-named
fields with labels, not name-split fields, whenever it detects a duplicate pair.

A related, smaller hazard: a node literally named `a-->b` produces the edge id `a-->b-->c`,
which splits two ways. The rule is first-separator-wins, giving `a` and `b-->c` — the
residual cost of the name-split form, and representable only via labels.

## References

- Grafana data plane contract (kinds, versioning, "propose a new type"):
  https://grafana.com/developers/dataplane/
- The row format, still supported: [../data-plane/graph-long.md](../data-plane/graph-long.md)
- The specification this record backs: [../data-plane/graph-wide.md](../data-plane/graph-wide.md)
- `rowsToFields` source (the auto-detection, the display-name keying and the label
  fall-through measured above):
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/rowsToFields/rowsToFields.ts
- Sourcing guide: [../docs/relations-data-sources.md](../docs/relations-data-sources.md)
- Rewrite plan: [graph-wide-migration.md](./graph-wide-migration.md)
- Whether core's ad-hoc panel transformations would change the migration:
  [graph-wide-adhoc-transformations.md](./graph-wide-adhoc-transformations.md)
- Family coverage overview: [../data-plane/echarts-coverage.md](../data-plane/echarts-coverage.md)
- Proof dashboard: `provisioning/dashboards/relations/graph-wide.json`
