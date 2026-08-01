# Graph, wide — `graph-nodes-wide` / `graph-edges-wide`

A **field-based** contract for graph data: **one node is one field, one edge is one
field.** Values are the mark's weight over the frame's row dimension; identity is
`field.name`; topology is in `field.labels`; everything else — colour, unit,
decimals, thresholds, mappings, data links, per-mark style — is ordinary
`fieldConfig`.

> **Proposed kind, not a minted one.** `DataFrameType` in `@grafana/data` 13.1.1 has
> exactly twelve members (`timeseries-wide|long|many|multi`, `numeric-wide|multi|long`,
> `log-lines`, `directory-listing`, `heatmap-rows`, `heatmap-cells`, `histogram`) and
> none is graph-related, so nothing is being redefined here. The published contract
> spec explicitly invites new kinds — _"You can propose a new data plane type: They're
> designed to grow into maturity, not limit innovation"_ — and its versioning rules put
> a new kind at `meta.typeVersion` **`[0, 1]`** until it stabilises.
>
> The **legacy** row-based format stays supported and is documented, unchanged, in
> [node-graph.md](./node-graph.md) — retroactively `graph-*-long`. It is published on
> the core Node graph panel's
> [Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api)
> and is what Tempo, AWS X-Ray and TestData emit natively.
>
> **Nothing reads this contract yet.** `frameToNodeGraph`
> (`src/lib/echarts/converters/nodeGraph.ts`) consumes the long form only; feeding it a
> wide frame throws (see [Current status](#current-status)). The rewrite is planned in
> [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md).

## Why fields rather than rows

`todo/relations-item-overrides.md` documents the wall: Grafana's override matcher is
`FieldMatcher = (field, frame, allFrames) => boolean`, so it cannot address a row.
A long node-graph frame makes every node and every edge a row, which is why "colour
`eu-west` red" and "link `us-west → us-east` to a trace" are inexpressible, and why
five escape routes were enumerated — four of them needing core changes.

Making the mark a **field** dissolves the question instead of arbitrating it, because a
field is the unit Grafana's whole configuration pipeline already addresses. The pivot is
not novel in this repo: [part-to-whole](./part-to-whole.md) already made it, deleting
its long-format path so one field = one slice.

Today's nodes and edges frames are not a novel kind either. They are ordinary
**`numeric-long`** frames with reserved column names: `source`/`target` are dimension
columns and `mainstat` is the value column. So this is the same data, read the way the
data plane already reads long-vs-wide everywhere else.

## Current status

| Consumer                                                   | `graph-*-long` | `graph-*-wide`                                   |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------ |
| Core **Node graph** panel                                  | Yes            | No                                               |
| ECharts **relations** panel (`graph` / `sankey` / `chord`) | Yes            | **No — throws** (`Invalid chart option`)         |
| Core **Bar chart** / **Bar gauge** / **Stat** / **Table**  | No             | Yes — one mark per field, today, with no changes |
| Core **Time series**                                       | No             | Yes, when a `time` row dimension is present      |

The third and fourth rows are the point: a wide graph frame is already a first-class
Grafana citizen. The proof dashboard
(`provisioning/dashboards/relations/graph-wide.json`) demonstrates per-mark colour,
data links, visibility and units on wide graph frames using nothing but core panels and
`fieldConfig`, because the capability is Grafana's rather than any panel's.

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

Two further behaviours were measured because they decide the design, not just its cost:

| Behaviour                                 | Observed                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.state.range` contamination         | A legacy nodes frame with `mainstat` (12, 8), `noderadius` (40, 60) and `arc__ok` (0.9, 0.5) gives **every** field `{min: 0.5, max: 60}`. The wide equivalent gives `{min: 8, max: 12}` — node values only.     |
| Fixed colours are theme-resolved upstream | A `byName` override of `dark-red` reaches the field as `config.color.fixedColor: 'dark-red'` and `field.display(v).color` returns `#C4162A`. No `theme.visualization.getColorByName` call is needed downstream. |

## Frame role resolution

In precedence order, mirroring how [hierarchy](./hierarchy.md) layers meta over field
shape:

| Signal                                                            | Survives                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. `frame.meta.type === 'graph-edges-wide' \| 'graph-nodes-wide'` | Only sources that can set frame meta                                         |
| 2. **Field shape**                                                | Everything — `csv_content`, SQL Expressions, `rowsToFields`, transformations |
| 3. **Panel option** (a refId picker)                              | Always; the manual override of last resort                                   |

Field shape is the load-bearing signal, exactly as it already is for the long form
(`isNodeGraphFrames`, `src/lib/echarts/converters/nodeGraph.ts`), and for the same
reason: provisioned `csv_content` fixtures and SQL Expression outputs can set neither
`meta.type` nor a frame name.

The shape test, in order:

1. A frame whose numeric fields carry **both** endpoint label keys (default `source`
   and `target`) is the **edges** frame.
2. Otherwise a frame whose numeric field names **split on the separator** (`->`, or
   `→`) is the **edges** frame.
3. Otherwise, in a response that already has an edges frame, the remaining frame with
   numeric fields is the **nodes** frame.
4. A lone nodes frame is a table, not a graph — an edges frame is required, as in the
   long form.

For precedent on signal 3, see XY chart's series editor and geomap's layer/query
pairing, both of which put a per-query selector in panel options.

## Edges frame — `graph-edges-wide`

Required. One numeric field per edge.

| Element                                                                | Carries                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| One **`number`** field per edge                                        | The edge. Its values are the edge's weight over the row dimension                                                                |
| `field.name`                                                           | **Edge id, and the stable override target.** Must be meaningful — see [Identity](#identity-display-names-and-override-targeting) |
| `field.labels[sourceKey]` / `[targetKey]`                              | Endpoints. Keys are configurable (default `source` / `target`) so Tempo's `client` / `server` works unchanged                    |
| Field-name split on the separator (default `->`; `→` also accepted)    | Endpoint **fallback**, for sources that cannot emit labels                                                                       |
| Optional leading `time` **or** `string` field                          | The row dimension. Absent ⇒ single-row instant data, as the long form always is                                                  |
| `config.displayName`                                                   | Edge label                                                                                                                       |
| `config.color`                                                         | Edge colour — **all eight modes**, including by-value over the edge's own values                                                 |
| `config.links`                                                         | Per-edge data links                                                                                                              |
| `config.unit` / `decimals` / `mappings` / `thresholds` / `min` / `max` | Tooltip formatting and data-driven colour, per edge                                                                              |
| `config.custom.lineWidth`                                              | `lineStyle.width` — replaces `thickness`                                                                                         |
| `config.custom.lineType`                                               | `lineStyle.type` (`solid` / `dashed` / `dotted`) — replaces `strokedasharray`                                                    |
| `config.custom.curveness`                                              | `lineStyle.curveness`, per edge on all three variants                                                                            |
| `config.custom.hideFrom`                                               | Per-edge visibility (`viz` / `legend` / `tooltip`)                                                                               |

**The separator is `->` by default**, not `→`. Every sourcing path that can produce a
name-split edge id — a CSV header, `CONCAT(caller,'->',callee)`, a Prometheus
`legendFormat` — types ASCII, and every example below is a verified `csv_content`
fixture. `→` is accepted so a hand-authored frame reads nicely.

### Endpoint precedence

Labels first, name-splitting second, and the ordering is not cosmetic: labels are the
only form that can express [parallel edges](#parallel-edges-require-labels), and the
only one immune to [separator collision](#separator-collision). A frame may carry both;
labels win.

## Nodes frame — `graph-nodes-wide`

Optional, exactly as in the long form — the node set is derived from the edges when it
is absent. One numeric field per node.

| Element                                                 | Replaces (long form)                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| One **`number`** field per node; `field.name` = node id | `id` column                                                                                      |
| Reduced value from `reduceOptions.calcs[0]`             | `mainstat`                                                                                       |
| Reduced value from `reduceOptions.calcs[1]`             | `secondarystat`                                                                                  |
| `config.displayName`                                    | `title`                                                                                          |
| `config.color.fixedColor`                               | `color`, string form                                                                             |
| `config.color.mode` + `thresholds` / `mappings`         | `color`, **numeric** form — specced in the long form but read by nobody (`nodeGraph.ts:165-168`) |
| `config.links`                                          | _no equivalent today_ — the gap `todo/relations-data-links.md` cannot close                      |
| `config.unit` / `decimals`                              | per-node stat formatting; the long form has one unit for the whole column                        |
| `config.custom.nodeRadius`                              | `noderadius`                                                                                     |
| `config.custom.subtitle`                                | `subtitle`                                                                                       |
| `config.custom.icon`                                    | `icon`                                                                                           |
| `config.custom.fixedX` / `.fixedY`                      | `fixedx` / `fixedy`                                                                              |
| `config.custom.hideFrom`                                | _no equivalent_ — registered but unreachable today (`lib/grafana/editor/common/fieldConfig.ts`)  |
| `field.labels`                                          | `detail__*`                                                                                      |
| `config.thresholds` steps                               | `arc__*` — an approximation, see [Pitfalls](#pitfalls)                                           |

### The `reduceOptions` contract

The family registers Grafana's standard Value options
(`addStandardDataReduceOptions`, `src/lib/grafana/editor/common/standardReducer.ts`) —
which the long-form family deliberately does **not**, because there rows are the
entities (`src/modules/relations/parity.md`).

| Key      | Behaviour                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calcs`  | **Truncated to two entries.** `calcs[0]` is the main stat, `calcs[1]` the secondary — the natural replacement for the two stat columns, and one better than pie's truncate-to-one |
| `values` | Pinned to `false` (**Calculate**). All-values mode would emit one mark per row, which is not what a row dimension means here — and it caps at 25 (see [#3](#verified-behaviours)) |
| `limit`  | Ignored, since All-values mode is not used                                                                                                                                        |
| `fields` | Passed through. Empty = the numeric matcher; set = a **`byRegexp`** matcher, which is the escape hatch when a frame carries numeric fields that are not marks                     |

Calculate mode is **uncapped** (verified: 500 fields → 500 results), so a wide reduce is
safe at the scale a real topology needs. On a single-row instant frame every reducer
that returns a value returns that value, so `lastNotNull`, `last`, `mean`, `min`, `max`
and `sum` all agree — the calc only starts to matter once there is a row dimension.

## Identity, display names and override targeting

Three behaviours, all measured, that together decide how the contract must be authored.

**`byName` matches the raw name _or_ the display name.** `fieldNameMatcher` returns
`name === field.name || name === getFieldDisplayName(field, frame, allFrames) || fallback(...)`.
So an override written against the edge id `e1` matches regardless of what labels do to
the display name.

**`byRegexp` matches the display name only.** It computes
`getFieldDisplayName(...)` and tests that. A pattern anchored on the bare id —
`/^e1$/` — therefore **fails** on a labelled field whose display name is
`e1 {source="a", target="b"}`; `/^e1 /` matches. This is a real trap at scale, where
`byRegexp` is the recommended bulk tool.

**The display name is `name` + `' '` + labels, and it is not stable.**
`calculateFieldDisplayName` pushes `field.name` (unless it is literally `Value`) and
then the labels — as the bare value when a _single_ label key is shared across **every
frame in the response**, otherwise as the formatted set. Measured:

| Frame content                                             | Display name                  |
| --------------------------------------------------------- | ----------------------------- |
| `e1`, labels `{source:'a', target:'b'}`                   | `e1 {source="a", target="b"}` |
| `a`, labels `{title:'Gateway'}` — nodes frame **alone**   | `a Gateway`                   |
| `a`, labels `{title:'Gateway'}` — **with** an edges frame | `a {title="Gateway"}`         |
| `Value`, labels `{source:'a', target:'b'}`                | `{source="a", target="b"}`    |
| `a->b`, no labels                                         | `a->b`                        |
| `a->b` twice in one frame                                 | `a->b 1` and `a->b 2`         |

So: **the contract requires a meaningful `field.name`**, and overrides should target it.
`rowsToFields` with `id` as the name field satisfies this by construction. A field named
`Value` degrades its display name to the raw label set, and — worse — makes
`byName: 'Value'` match **every** edge at once (verified against a Prometheus-shaped
response).

The override picker makes the stable choice available: for a labelled frame it lists
both `e1 {source="a", target="b"}` and `e1 (base field name)`, and choosing the latter
persists `{ matcher: { id: 'byName', options: 'e1', scope: 'series' } }`, which survives
a save and reload.

### Three normative rules

1. **Cycle and self-loop handling is unchanged.** The sankey DAG restriction is an
   ECharts constraint, not a contract one. `converters/dag.ts` still breaks cycles and
   drops self-loops for the sankey variant; `graph` and `chord` still render both. The
   pivot does not fix, worsen or interact with this.
2. **Parallel edges require labels.** Two edges over the same pair cannot be two
   identically named fields — see [below](#parallel-edges-require-labels).
3. **A `byName` override on an adjacency-matrix column targets the node**, not the
   column's inbound edges. A matrix column _is_ a node; an edge is a cell, and a cell is
   not addressable. See [Adjacency matrix](#dense-graphs-the-adjacency-matrix-variant).

## Row dimension variants

The row dimension is what the mark's values are indexed by. All three forms are the same
kind; they differ only in frame count and in whether a leading dimension field exists.

| Variant                         | Shape                                                                   | Row dimension   | Notes                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| **Instant** (canonical)         | One frame, no leading field, `length: 1`                                | none            | What `rowsToFields` always produces. The reduce is a no-op                              |
| **Ranged**                      | One frame, leading `time` or `string` field                             | time / category | A range query needs no aggregation — `calcs[0]` reduces it. Renders in core Time series |
| **Multi** (`graph-edges-multi`) | One frame **per edge**, frame `name` = the edge id, value field `Value` | time            | The natural Prometheus/Loki `time_series` shape                                         |

The multi variant works because `getFieldDisplayName` skips a field literally named
`Value` and substitutes the frame name when frame names differ: two frames named `a->b`
and `a->c` yield display names `a->b` and `a->c`. Verified. Its hazard is the one named
above — the raw name `Value` is shared, so `byName: 'Value'` hits every edge.

## Single-frame prefix variant

For sources that can emit neither `meta` nor labels and cannot run two queries, one
frame may carry both roles using field-name prefixes:

```csv
node__a,node__b,node__c,edge__a->b,edge__b->c
12,8,3,420,380
```

`node__` and `edge__` (double underscore, matching the long form's `arc__` / `detail__`
idiom) split the frame into the two roles; the remainder of the name is the id.

**This is a documented alternative, not the headline form**, for two measured reasons:
the prefix leaks into the override picker (every entry reads `node__a` unless each field
also sets `displayName`, which defeats the point of the shortcut), and it destroys the
zero-reshape Prometheus and `rowsToFields` paths, both of which produce clean ids
already.

## Dense graphs: the adjacency-matrix variant

An edge-per-field frame grows as |E|: three nodes fully connected is six fields, and a
dense 30-node chord is 870. The matrix form trades per-edge addressability for a field
count that grows as N.

Core's **`groupingToMatrix`** produces it from a legacy frame with no new code. Measured
output for the dense fixture (Column = `target`, Row = `source`, Cell = `mainstat`,
Empty = `null`):

| Aspect         | Observed                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Key field name | **`source\target`** — `rowField` + `\` + `columnField`, not `source`                            |
| Columns        | The distinct `target` values **in first-appearance order**, not sorted                          |
| Frame `refId`  | Unset                                                                                           |
| Frame shape    | **Not square** — a node that never appears as a source gets no row, never as a target no column |
| Empty cell     | `null` with `emptyValue: 'null'`; `''` when the source is `csv_content` with a blank cell       |

So the contract for this variant:

- The **key field** is the row dimension: a `string` field of source-node ids, named
  `source\target` when `groupingToMatrix` produced it and free-form otherwise. It is
  identified as the first `string` field, not by name.
- Each **numeric field is a node** (a target). `byName` on it targets the node — rule 3.
- A **cell is an edge**, and carries no config of its own. Per-edge colour, links,
  hiding and curveness are **not available** in this variant.
- An empty cell means **no edge**, and must not read as zero. `''` from `csv_content`
  and `null` from `groupingToMatrix` are both "absent".

## Complete mapping from `graph-*-long`

Every field in [node-graph.md](./node-graph.md)'s two tables, with its wide equivalent
or the reason it has none. Acceptance requires this table to be exhaustive.

### Edges

| Long form         | Wide form                                     | Note                                                                                                      |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`              | `field.name`                                  | Becomes the override target, which the long form's `id` never was                                         |
| `source`          | `field.labels.source`, or the name split      | Label key configurable                                                                                    |
| `target`          | `field.labels.target`, or the name split      | Label key configurable                                                                                    |
| `mainstat`        | the field's **values**, reduced by `calcs[0]` | Cannot be a string any more — a field has one type, and the mark's field is numeric                       |
| `secondarystat`   | `calcs[1]`                                    | Same field, second reducer                                                                                |
| `detail__*`       | `field.labels.*`                              | Still no context menu; labels can fold into tooltip rows                                                  |
| `thickness`       | `config.custom.lineWidth`                     | Was also the weight fallback; the weight is now the field's own value, so the fallback is gone            |
| `color`           | `config.color`                                | All eight modes, not just an HTML string                                                                  |
| `strokedasharray` | `config.custom.lineType`                      | Same three-way approximation (`solid` / `dashed` / `dotted`); an SVG dash array has no ECharts equivalent |
| `highlighted`     | **dropped**                                   | Deprecated for edges since Grafana 10.5 — use colour                                                      |

### Nodes

| Long form        | Wide form                                    | Note                                                                                                                                                                                                |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `field.name`                                 | The override target                                                                                                                                                                                 |
| `title`          | `config.displayName`                         | `rowsToFields` maps a `title` column onto it with one explicit mapping                                                                                                                              |
| `subtitle`       | `config.custom.subtitle`                     | Plugin-declared                                                                                                                                                                                     |
| `mainstat`       | values, reduced by `calcs[0]`                | —                                                                                                                                                                                                   |
| `secondarystat`  | `calcs[1]`                                   | —                                                                                                                                                                                                   |
| `arc__*`         | `config.thresholds` steps                    | **Approximation.** A threshold set is an ordered colour partition of the value domain, not arbitrary proportions summing to 1; and no ECharts relationship series draws a multi-section ring anyway |
| `detail__*`      | `field.labels.*`                             | —                                                                                                                                                                                                   |
| `color` (string) | `config.color.fixedColor`                    | `rowsToFields` converts a legacy `color` column automatically (verified)                                                                                                                            |
| `color` (number) | `config.color.mode` + the field's own values | This is what the long form specced and nobody implemented; here it is just a by-value scheme                                                                                                        |
| `icon`           | `config.custom.icon`                         | Still unrendered — the values are Grafana icon names and need resolving to an ECharts `symbol`                                                                                                      |
| `noderadius`     | `config.custom.nodeRadius`                   | Leaves `field.state.range` uncontaminated, which was the point                                                                                                                                      |
| `highlighted`    | **dropped**                                  | No emphasis-by-data concept; hover and legend emphasis cover it                                                                                                                                     |
| `fixedx`         | `config.custom.fixedX`                       | All-or-nothing rule is unchanged                                                                                                                                                                    |
| `fixedy`         | `config.custom.fixedY`                       | Same                                                                                                                                                                                                |
| `isinstrumented` | **dropped**                                  | Never rendered by this plugin in either form; it is a core-panel styling hint                                                                                                                       |

## Sourcing

The full picture is in [../docs/relations-data-sources.md](../docs/relations-data-sources.md).
The short version, because it is the sharpest practical argument for the contract:

### Prometheus / Loki — zero reshaping

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Run it **instant**, `format: time_series`, with a legend format:

```
{{client}}->{{server}}
```

That is the whole recipe. Each series is one frame, one edge; the legend format lands in
`config.displayNameFromDS`, which `getFieldDisplayName` returns verbatim, so the display
name **is** the edge id and `byName: 'a->b'` targets exactly one edge (verified). The
endpoints stay in `field.labels` as `client` / `server`, which the contract accepts as
the endpoint keys directly.

**Without a legend format** the display name becomes the frame name _and_ the label set,
duplicated — `{client="a", server="b"} {client="a", server="b"}` — because the frame name
and the labels are both pushed. It renders, but it is not an id anybody would want to
write an override against. The legend format is not optional in practice.

The long form needs **two SQL Expressions** over the same query to reach the same place
(`docs/relations-data-sources.md`), and it needs the query to be instant because a range
query returns many rows per edge. The wide form needs neither: a range query is a row
dimension, and `calcs[0]` reduces it.

### SQL and CSV — `rowsToFields`

For anything shaped like a table, core's `rowsToFields` performs the pivot, and its
auto-detection is exactly the mapping the contract wants (verified, no options set):

| Column                                        | Becomes                  | How                                                                        |
| --------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| first `string` field                          | `field.name`             | auto — so `id` must be the **first** string column                         |
| first `number` field                          | the field's single value | auto — so `mainstat` must be the **first** numeric column                  |
| `color` / `unit` / `min` / `max` / `decimals` | field **config**         | auto — the lowercased column name is looked up in `configMapHandlers`      |
| anything else                                 | `field.labels[column]`   | auto — the documented fall-through                                         |
| `title`                                       | `config.displayName`     | needs one explicit mapping (`displayname` ≠ the handler key `displayName`) |

Two hard requirements fall out of the measurements:

- **`convertFieldType` first, always, for `csv_content`.** Without a numeric field
  `rowsToFields` silently returns its input.
- **Column order matters.** Auto-detection takes the _first_ string and _first_ numeric
  field. `source,target,id,mainstat` would name the fields after `source`. Reorder with
  `organize`, or state the mapping explicitly.

A third behaviour is worth knowing because it is a small gift: labels are keyed by the
source column's **display name**, not its raw name. TestData's `node_graph`
`feature_showcase` / `response_medium` set `config.displayName` on their `arc__*` and
`detail__*` columns, so pivoting those frames produces labels called `Success`, `Failed`,
`Requests per second` rather than `arc__success` — observed. The cost is display-name
length: four labels per node makes every picker entry long, which is the real scale limit
(see [Limits](#limits-and-divergences)).

### Per-node config from a second query

`configFromQuery` ("Config from query results") sets `min`, `max`, `unit`, `decimals`,
`displayName`, `color`, one `thresholds` step and value mappings — more than its docs
claim, but **one config for every field its `applyTo` matcher selects**, because the
config frame is reduced to a single row (verified: two node fields both received
`displayName: 'Gateway'`). Targeting one node means one transform per node, so it does
not scale.

`rowsToFields` is the per-row path, and it is the one to reach for.

## Worked examples

Every wide CSV below is literal `csv_content` — pasted into a TestData query and
confirmed to render. Each wide edges/nodes fixture needs a `convertFieldType` transform
only when it is going _through_ `rowsToFields`; a directly-authored wide CSV is already
one numeric field per mark.

### 1. Chain DAG — 3 nodes, 2 edges

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

Two fields, one per edge. The field name is the edge id _and_ the override target;
endpoints parse out of it. Renders as `graph`, `sankey` or `chord`.

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

Structurally identical, and **the contract change does not touch cycle handling**
(normative rule 1). The sankey path still drops the self-loop and one back-edge;
`graph` and `chord` still draw all three.

### 3. Fan-out / fan-in DAG — 4 nodes, 4 edges

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

Four independently overridable ribbons. Colouring only `a->c`, or curving only it, is
impossible in the long form and is one `byName` override here.

The same fixture with a **categorical row dimension** — a leading `string` field, which
is what lets a core Bar chart render it and is how the proof dashboard shows the
per-edge overrides:

```csv
row,a->b,a->c,b->d,c->d
total,60,40,60,40
```

### 4. Nodes frame — 3 nodes

Legacy:

```csv
id,title,mainstat
a,Gateway,12
b,API,8
c,DB,3
```

Wide, authored directly — identity and values only:

```csv
a,b,c
12,8,3
```

The titles are gone, because **a wide CSV cannot express field config**: a header cell
is a field name and nothing else. `Gateway` / `API` / `DB` become `displayName` on
fields `a` / `b` / `c` — three `fieldConfig.overrides` entries, which unlike a `title`
column are editable in the UI.

To keep them in the query, run the _legacy_ CSV through `rowsToFields`:

| Mapping                      | Result                            |
| ---------------------------- | --------------------------------- |
| `id` → **Field name**        | fields `a`, `b`, `c` (automatic)  |
| `mainstat` → **Field value** | values `12`, `8`, `3` (automatic) |
| `title` → **Display name**   | `Gateway`, `API`, `DB`            |
| any unmapped column          | `field.labels`                    |

Verified end to end. Left unmapped, `title` becomes a label instead, and the display
name reads `a Gateway` (or `a {title="Gateway"}` once an edges frame joins the
response — see [#2b](#verified-behaviours)).

A node with no edges is unaffected by the pivot: it needs a nodes frame in either form.

### 5. Dense adjacency — 3 nodes, 6 edges

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

Six fields for three nodes — the N·(N−1) growth, which is the dense-graph risk in
concrete form. At 30 nodes it is 870 fields. With a categorical row dimension, as the
proof dashboard renders it:

```csv
row,a->b,a->c,b->a,b->c,c->a,c->b
total,10,20,30,40,50,60
```

Wide, adjacency matrix (hand-authored):

```csv
source,a,b,c
a,,10,20
b,30,,40
c,50,60,
```

Four fields regardless of density. The same shape from the legacy CSV needs no
authoring at all — `groupingToMatrix` produces it, naming the key column
`source\target` and leaving absent cells `null`. Per-node overrides work; **per-edge
overrides do not**, because an edge is a cell (normative rule 3).

### 6. Two hazards the wide form introduces

#### Parallel edges require labels

The long form tolerates two rows over the same pair:

```csv
id,source,target,mainstat
e1,a,b,10
e2,a,b,20
```

A directly-authored wide CSV cannot: naming both fields `a->b` collides, and the
measured consequence is worse than a rename. Both fields keep `field.name === 'a->b'`;
only their **display** names are disambiguated, to `a->b 1` and `a->b 2`. So
`byName: 'a->b'` matches **both** edges, `byName: 'a->b 2'` matches the second, and
`byName: 'a->b 1'` matches the first — while name-based endpoint parsing sees `a->b 1`
and fails.

Observed in a running panel over `csv_content` of `a->b,a->b` / `10,20`: the two columns
render as `a->b 1` and `a->b 2`, and a single `byName: 'a->b'` unit override formats
**both** cells as `10 ms` and `20 ms`.

The clean form keeps the ids as names and puts the endpoints in labels, which CSV cannot
do — so this shape is `rowsToFields`-only:

```csv
e1,e2
10,20
```

This is the one shape where the wide form is strictly harder to author than the legacy
one. The `legacyToWide` adapter must therefore emit **id-named fields with labels**, not
name-split fields, whenever it detects a duplicate pair.

#### Separator collision

A node literally named `a->b` produces the edge id `a->b->c`, which splits two ways.
The name-split form must either pick a rule (first separator wins) or reject the frame.
Labels have no such problem, which is the second reason they are primary.

### `toDataFrame` equivalents

The shapes above as unit-test partials.

```typescript
import { FieldType, toDataFrame } from '@grafana/data';

/** graph-edges-wide, instant, endpoints in labels — what `rowsToFields` emits. */
const edgesWide = toDataFrame({
  refId: 'rowsToFields-A',
  meta: { type: 'graph-edges-wide', typeVersion: [0, 1] },
  fields: [
    { name: 'e1', type: FieldType.number, values: [1200], labels: { source: 'gateway', target: 'api' } },
    { name: 'e2', type: FieldType.number, values: [800], labels: { source: 'gateway', target: 'web' } },
  ],
});

/** graph-nodes-wide, with the config that used to be columns. */
const nodesWide = toDataFrame({
  refId: 'rowsToFields-B',
  meta: { type: 'graph-nodes-wide', typeVersion: [0, 1] },
  fields: [
    {
      name: 'gateway',
      type: FieldType.number,
      values: [12],
      config: {
        displayName: 'Gateway',
        unit: 'ms',
        decimals: 0,
        color: { mode: 'fixed', fixedColor: 'dark-red' },
        links: [{ title: 'Runbook', url: 'https://example.com/runbook/gateway' }],
        custom: { nodeRadius: 40, subtitle: 'edge', hideFrom: { viz: false, legend: false, tooltip: false } },
      },
      labels: { zone: 'us-east-1' },
    },
    { name: 'api', type: FieldType.number, values: [8], config: { unit: 'percentunit', decimals: 2 } },
  ],
});

/** graph-edges-wide, ranged — a range query, no aggregation, reduced by calcs[0]. */
const edgesRanged = toDataFrame({
  refId: 'A',
  fields: [
    { name: 'time', type: FieldType.time, values: [1, 2, 3] },
    { name: 'a->b', type: FieldType.number, values: [60, 55, 70] },
    { name: 'a->c', type: FieldType.number, values: [40, 45, 30] },
  ],
});

/** graph-edges-multi — one frame per edge, the Prometheus `time_series` shape with a
 *  legend format of `{{client}}->{{server}}`. */
const edgesMulti = [
  toDataFrame({
    refId: 'A',
    name: '{client="a", server="b"}',
    fields: [
      { name: 'Time', type: FieldType.time, values: [1] },
      {
        name: 'Value',
        type: FieldType.number,
        values: [60],
        labels: { client: 'a', server: 'b' },
        config: { displayNameFromDS: 'a->b' },
      },
    ],
  }),
];

/** The single-frame prefix variant. */
const prefixed = toDataFrame({
  refId: 'A',
  fields: [
    { name: 'node__a', type: FieldType.number, values: [12] },
    { name: 'node__b', type: FieldType.number, values: [8] },
    { name: 'edge__a->b', type: FieldType.number, values: [420] },
  ],
});
```

## ECharts data specification

Pinned to **ECharts 6.1.0**. The contract changes what feeds the converter, not what the
converter feeds ECharts: `graph`, `sankey` and `chord` all read

```javascript
const edges = option.edges || option.links || [];
const nodes = option.data || option.nodes || [];
```

so one `{ nodes, links }` model still drives all three, and a variant switch is still a
layout change rather than a data change. See
[node-graph.md](./node-graph.md#echarts-data-specification) for the shared series table
and [echarts-coverage.md](./echarts-coverage.md) for why `series.lines` is not fed by
this kind either (it wants explicit coordinate polylines, which no Grafana frame
carries).

What the wide form changes at the ECharts boundary:

| ECharts key                           | Long form                                                     | Wide form                                          |
| ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| node `itemStyle.color`                | `color` column, else palette by position                      | `field.display(value).color` — all eight modes     |
| node `symbolSize`                     | `noderadius` column                                           | `config.custom.nodeRadius`                         |
| node `x` / `y` + `layout: 'none'`     | `fixedx` / `fixedy`, all-or-nothing                           | `config.custom.fixedX` / `.fixedY`, unchanged rule |
| link `lineStyle.color`                | `color` column, else the `source`/`target`/`gradient` keyword | `field.display(value).color`, else the keyword     |
| link `lineStyle.width`                | `thickness` column                                            | `config.custom.lineWidth`                          |
| link `lineStyle.type`                 | `strokedasharray`, approximated                               | `config.custom.lineType`, chosen directly          |
| link `lineStyle.curveness`            | not reachable per edge                                        | `config.custom.curveness`                          |
| link value (sankey/chord ribbon size) | `mainstat` → `thickness` → `1` fallback chain                 | the field's reduced value; no chain needed         |

### Pitfalls

Inherited from ECharts or from the data, and **unchanged** by the contract:

- **A sankey built from a real service graph crashes the panel.** `sankeyLayout.ts` runs
  Kahn's algorithm and then `throw new Error('Sankey is a DAG, the original data has
cycle!')`, not behind a `__DEV__` guard. Cycles must be broken before the links reach
  ECharts (`converters/dag.ts`). `graph` and `chord` are unaffected.
- **Self-loops** have no sankey representation and are dropped there.
- **A sankey node's declared `value` is a floor, not a label** —
  `Math.max(inSum, outSum, nodeRawValue)` — so a node's reduced stat must not be passed
  as the item `value` unless it is itself a flow.
- **A sankey labels from the node key** (`defaultText: node.id`) and a chord from the
  raw data index, so both need `label.formatter: '{b}'`. A node's `displayName` would
  otherwise never appear.
- **`arc__*` proportions cannot be drawn** by any of the four relationship series. The
  threshold mapping is an approximation for the same reason the long form's dominant-arc
  border was.
- **`icon` is still dropped** — Grafana icon names need resolving to an ECharts `symbol`.
- **`detail__*` — now labels — still has no context-menu surface.** They can fold into
  tooltip rows; ECharts has no context menu.

Eliminated by the contract, and listed so the diff is legible:

- **`mainstat` may be a string.** Gone: a field has one type, and a mark's field is
  numeric by contract. The `mainstat → thickness → 1` weight chain goes with it.
- **A node can be handed the edges frame's field.** Structurally impossible: each mark
  carries its own field.
- **Tooltip unit decided by frame order.** Each mark has its own `field.display`.
- **`field.state.range` contaminated by `noderadius` / `arc__*` / `fixedx`.** Those are
  config now, so the by-value domain is mark values only (measured: `{min: 8, max: 12}`
  instead of `{min: 0.5, max: 60}`).
- **Only two of eight colour modes reach the chart.** Colour is
  `field.display(value).color`, as in every other family, so
  `makeRelationsColorResolver` and its hierarchy twin are deletable.

## Limits and divergences

- **Field-count ceiling — measured, and it is the UI rather than the pipeline.**
  `applyFieldOverrides` is not the problem: over labelled edge fields it costs

  | Fields | Override rules | `applyFieldOverrides` | Picker options |
  | -----: | -------------: | --------------------: | -------------: |
  |     50 |              1 |                  3 ms |            100 |
  |    200 |             20 |                  2 ms |            400 |
  |    500 |             20 |                  3 ms |          1 000 |
  |  1 000 |             20 |                  7 ms |          2 000 |

  The reduce is uncapped at 500 fields and the pipeline stays in single-digit
  milliseconds at 1 000. What degrades is the **override picker**: it lists the display
  name _and_ the raw base name for every field, so a 1 000-edge frame is a 2 000-entry
  combobox. It is virtualized — only ~13 rows mount at a time — but on TestData's
  `node_graph` `response_medium` pivoted through `rowsToFields`, whose display names carry
  four labels each, opening it took **~4 s**. **Practical ceiling: a few hundred marks per
  frame**, and the binding constraint is display-name length as much as count. Beyond
  that, prefer `byRegexp` — remembering it tests the _display_ name, so anchor patterns
  tolerantly (`/^db-/`, not `/^db-.*$/` against an id that carries labels).

- **Dense graphs are pathological in the edge-per-field form** (example 5). Use the
  matrix variant and accept that per-edge config is unavailable.
- **Parallel edges cannot be authored in a wide CSV** (normative rule 2).
- **Metadata moves from data to configuration**, which is the point — it is what makes it
  overridable — but a topology whose membership changes cannot carry per-node metadata as
  cheaply as a `title` column does. Mitigations, in order of usefulness:
  `rowsToFields` (per row, automatic for `color` / `unit` / `min` / `max` / `decimals`),
  `field.labels` for query-derived attributes, `thresholds` / `mappings` for
  colour-by-health, and `configFromQuery` only where one config for many marks is
  actually wanted.
- **All-values reduce mode is not supported**, so the 25-item
  `DEFAULT_FIELD_DISPLAY_VALUES_LIMIT` never applies. If it were, it would silently drop
  marks.
- **`custom.*` is plugin-declared**, so a wide graph frame rendered by a _core_ panel
  keeps its colours, units, links, thresholds and visibility but not `nodeRadius`,
  `subtitle`, `icon`, `curveness` or `lineType`.

## Relation to `fieldConfig.itemOverrides`

[grafana/grafana#129905](https://github.com/grafana/grafana/pull/129905) proposes a
second, permanent override system parallel to the field one, scoped by its own plan doc
at seven PRs. This contract argues that **graph frames do not need it** — not that
nothing does. Marks that are irreducibly not fields (canvas elements, geomap features)
are outside what a pivot can reach.

Two findings belong in that conversation, and both are already in core:

- **`ValueMatcher`** — `(valueIndex, field, frame, allFrames) => boolean` — ships with a
  registry (`valueMatchers`, used by `filterByValue`) and is simply not wired to the
  override engine.
- **`MatcherScope`** — `'series' | 'nested' | 'annotation' | 'exemplar'` — ships with a
  `scope` parameter on `applyFieldOverrides`, a `MatcherScopeSelector` in `@grafana/ui`,
  and scope-grouped options in the picker. It is **live in 13.1.0**: the editor persists
  `scope: 'series'` into dashboard JSON (observed in the round-trip probe above).

Adding a `'node'` / `'edge'` scope is a far smaller core ask than a parallel override
system. The honest claim is that the contract makes even that unnecessary for this kind.

## References

- Grafana data plane contract (kinds, versioning, "propose a new type"):
  https://grafana.com/developers/dataplane/
- Numeric kind — what the long form actually is:
  https://grafana.com/developers/dataplane/numeric
- Legacy format, still supported: [node-graph.md](./node-graph.md)
- Node graph panel Data API (the published legacy contract):
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- Rows to fields transformation:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields
- Config from query results:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#config-from-query-results
- Grouping to matrix:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#grouping-to-matrix
- Field overrides (user-facing):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- Field overrides in a panel plugin:
  https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides.md
- `rowsToFields` / `fieldToConfigMapping` source (the auto-detection and label
  fall-through measured above):
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/rowsToFields/rowsToFields.ts
- `configFromQuery` source (the one-row config reduction):
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/configFromQuery/configFromQuery.ts
- Sourcing guide: [../docs/relations-data-sources.md](../docs/relations-data-sources.md)
- Rewrite plan: [../todo/graph-wide-migration.md](../todo/graph-wide-migration.md)
- Per-item options, the problem this contract dissolves:
  [../todo/relations-item-overrides.md](../todo/relations-item-overrides.md)
- Family coverage overview: [echarts-coverage.md](./echarts-coverage.md)
- Proof dashboard: `provisioning/dashboards/relations/graph-wide.json`
