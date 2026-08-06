# Design history — `graph-nodes-wide` / `graph-edges-wide`

> **A working record, not the specification.** The spec is
> [data-plane/graph-wide.md](../../../data-plane/graph-wide.md); the row form it replaced
> is [data-plane/graph-long.md](../../../data-plane/graph-long.md). What is kept here is
> the evidence and the reasoning behind them — what was measured in a running Grafana,
> which alternatives were considered and rejected, and what the pivot costs. Read the spec
> first; come here for _why_ a rule says what it says.

The contract is **field-based**: **one node is one field, one edge is one field.** Values
are the mark's weight over the frame's row dimension; identity is `field.name`; topology is
in `field.labels`; everything else — colour, unit, decimals, thresholds, mappings, data
links, per-mark style — is ordinary `fieldConfig`.

The kind is **proposed, not minted.** `DataFrameType` in `@grafana/data` 13.1.1 has exactly
twelve members (`timeseries-wide|long|many|multi`, `numeric-wide|multi|long`, `log-lines`,
`directory-listing`, `heatmap-rows`, `heatmap-cells`, `histogram`) and none is
graph-related, so nothing was redefined. The published contract spec explicitly invites new
kinds — _"You can propose a new data plane type: They're designed to grow into maturity,
not limit innovation"_ — and its versioning rules put a new kind at `meta.typeVersion`
**`[0, 1]`** until it stabilises.

The **row** format stays supported: it is what Tempo, AWS X-Ray and TestData emit natively,
and it is published on the core Node graph panel's
[Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).
The relations panel reads the wide contract only; `legacyToWide` converts the row form
above the panel.

## Terms

| Term                 | Meaning here                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mark**             | One drawn thing — a node or an edge. (Elsewhere in the plugin: a pie slice, a bar, a treemap tile.) The word matters because the whole contract is about what a mark _is_ in the frame: a row in the long form, a field in the wide one.                                                  |
| **Per-mark styling** | Any configuration that applies to **one** mark and not its siblings. Concretely: `color`, `unit`, `decimals`, `mappings`, `thresholds`, `min`/`max`, `links`, `custom.hideFrom`, and the per-item ECharts style (`lineWidth`, `curveness`, `lineType`, `nodeRadius`, `icon`, `subtitle`). |
| **Row dimension**    | What a mark's values are indexed by — nothing (instant), time (ranged), or a category (a leading `string` field).                                                                                                                                                                         |
| **Long / wide**      | The data-plane convention already used for `timeseries-*` and `numeric-*`: **long** = one row per observation with dimension columns; **wide** = one field per series, dimensions folded into names and labels.                                                                           |

"Per-mark styling" is the thing the long form cannot express at all, because Grafana's
override matcher addresses fields and a long-form mark is a row. Every capability claim in
this doc is ultimately that one sentence.

## The two shapes, side by side

Six edges over three nodes (`a`, `b`, `c` fully connected), as each shape would arrive.

**`graph-edges-long`** — one row per edge, four fields. This is
[graph-long.md](../../../data-plane/graph-long.md).

```csv
id,source,target,mainstat
a-->b,a,b,10
a-->c,a,c,20
b-->a,b,a,30
b-->c,b,c,40
c-->a,c,a,50
c-->b,c,b,60
```

| id      | source | target | mainstat |
| ------- | ------ | ------ | -------- |
| `a-->b` | a      | b      | 10       |
| `a-->c` | a      | c      | 20       |
| `b-->a` | b      | a      | 30       |
| `b-->c` | b      | c      | 40       |
| `c-->a` | c      | a      | 50       |
| `c-->b` | c      | b      | 60       |

→ 4 fields, 6 rows. A mark is a **row**. Nothing is per-mark configurable.

**`graph-edges-wide`, edge-per-field** — one field per edge, one row.

```csv
a-->b,a-->c,b-->a,b-->c,c-->a,c-->b
10,20,30,40,50,60
```

| `a-->b` | `a-->c` | `b-->a` | `b-->c` | `c-->a` | `c-->b` |
| ------- | ------- | ------- | ------- | ------- | ------- |
| 10      | 20      | 30      | 40      | 50      | 60      |

→ 6 fields, 1 row. A mark is a **field**. Every edge is independently configurable.
Field count grows as |E| — the dense-graph cost, quantified in
[Performance](#performance-which-frame-shape-is-cheapest).

A third shape, the **adjacency matrix** (one field per target node, one cell per edge), was
specified at length and rejected. Its remains are in
[data-plane/graph-matrix.md](../../../data-plane/graph-matrix.md).

## Why fields rather than rows

`todo/relations-item-overrides.md` documents the wall: Grafana's override matcher is
`FieldMatcher = (field, frame, allFrames) => boolean`, so it cannot address a row.
A long node-graph frame makes every node and every edge a row, which is why "colour
`eu-west` red" and "link `us-west → us-east` to a trace" are inexpressible, and why
five escape routes were enumerated — four of them needing core changes.

Making the mark a **field** dissolves the question instead of arbitrating it, because a
field is the unit Grafana's whole configuration pipeline already addresses. The pivot is
not novel in this repo: [part-to-whole](../../../data-plane/part-to-whole.md) already made it, deleting
its long-format path so one field = one slice.

Today's nodes and edges frames are not a novel kind either. They are ordinary
**`numeric-long`** frames with reserved column names: `source`/`target` are dimension
columns and `mainstat` is the value column. So this is the same data, read the way the
data plane already reads long-vs-wide everywhere else.

## Current status

| Consumer                                                   | `graph-*-long`                  | `graph-*-wide`                                   |
| ---------------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| Core **Node graph** panel                                  | Yes                             | No                                               |
| ECharts **relations** panel (`graph` / `sankey` / `chord`) | Yes — converted above the panel | **Yes — this is now its only reader**            |
| Core **Bar chart** / **Bar gauge** / **Stat** / **Table**  | No                              | Yes — one mark per field, today, with no changes |
| Core **Time series**                                       | No                              | Yes, when a `time` row dimension is present      |

The panel reads **only** the wide form (`lib/echarts/converters/graphWide.ts`); the row form
reaches it through `legacyToWide`, registered on the plugin with
`PanelPlugin.setDataTransformations` so it runs _above_ the panel, before
`applyFieldOverrides`. That placement is what makes every mark an override target, and it is
why the family's minimum supported Grafana is the release carrying that API. Migration
record: `todo/graph-wide-migration.md`.

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

Further behaviours were measured because they decide the design, not just its cost. The
first two are here in full; the rest are summarised in
[More measured behaviours](#more-measured-behaviours) and expanded in their own sections.

| Behaviour                                 | Observed                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.state.range` contamination         | A legacy nodes frame with `mainstat` (12, 8), `noderadius` (40, 60) and `arc__ok` (0.9, 0.5) gives **every** field `{min: 0.5, max: 60}`. The wide equivalent gives `{min: 8, max: 12}` — node values only.     |
| Fixed colours are theme-resolved upstream | A `byName` override of `dark-red` reaches the field as `config.color.fixedColor: 'dark-red'` and `field.display(v).color` returns `#C4162A`. No `theme.visualization.getColorByName` call is needed downstream. |

### More measured behaviours

| Behaviour                                                      | Observed                                                                                                                                                                                                                      | Detail                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| All three separator forms work as field names                  | `a-->b`, `a→b` and `my-svc-->other-svc` all survive `csv_content` as field names, and a `byName` override targets each exactly. But shortest-first separator matching mis-splits `a-->b` into `a-` / `b`.                     | [The separator](#the-separator)                                                  |
| Duplicate field names are individually targetable              | Two fields may share a name; only the **display** name is disambiguated (`a-->b 1` / `a-->b 2`). `byName` on the raw name hits both; on an ordinal, exactly one. The ordinal is positional within the frame.                  | [Parallel edges](#parallel-edges-require-labels)                                 |
| `PanelDataSummary` exposes the meta signals                    | 13.1.1 has `hasDataFrameType`, `hasPreferredVisualisationType` and `rawFrames`, so suggestions are reachable for both formats. The repo's own "exposes neither" comment is stale.                                             | [Frame meta](#frame-meta)                                                        |
| A real service map pivots poorly by default                    | TestData `node_graph` `response_small` (a saved X-Ray map) through zero-config `rowsToFields` yields node fields named `0` … `16` and takes the edge value from `secondarystat`, because X-Ray's `mainstat` is a string.      | [Reality check](#reality-check-the-natively-long-producers-are-the-awkward-case) |
| Frame shape changes pipeline cost by ~200×                     | 5 000 marks: 0.1 ms in long, 18.6 ms in edge-per-field wide. ECharts is unaffected either way.                                                                                                                                | [Performance](#performance-which-frame-shape-is-cheapest)                        |
| No transformation can write `custom.*` or `links`              | `configMapHandlers` is a closed list of thirteen; its only config targets are `max`, `min`, `unit`, `decimals`, `displayName`, `color`, `thresholds` and `mappings`. Seven contract mappings are unsourceable this way.       | [What a native pivot cannot carry](#what-a-native-pivot-cannot-carry)            |
| `rowsToFields` mappings key on the **display** name            | `evaluateFieldMappings` matches `getFieldDisplayName(field, frame)`, so a mapping must say `Average response time`, not `mainstat`. A raw-name mapping returns the **input frame identically** — a silent no-op.              | [Two traps](#two-traps-in-rowstofields-itself)                                   |
| The pivot discards `meta`, `name` and the stat column's config | Output is `{ fields, length, refId }`; `preferredVisualisationType` is lost, `meta.type` unsettable, and frames with no `refId` both become `rowsToFields-undefined`. `unit` / `decimals` on the value column are not copied. | [Three losses](#three-losses-that-are-not-handler-gaps)                          |
| `secondarystat` cannot survive an instant pivot                | Output is `length: 1`, so `calcs[0]` and `calcs[1]` reduce the same value and must agree. The second stat degrades to a label, losing type, unit and decimals.                                                                | [Three losses](#three-losses-that-are-not-handler-gaps)                          |

## Frame role resolution

In precedence order, mirroring how [hierarchy](../../../data-plane/hierarchy.md) layers meta over field
shape:

| Signal                                                            | Survives                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. `frame.meta.type === 'graph-edges-wide' \| 'graph-nodes-wide'` | Only sources that can set frame meta                                         |
| 2. **Field shape**                                                | Everything — `csv_content`, SQL Expressions, `rowsToFields`, transformations |
| 3. **Panel option** (a refId picker)                              | Always; the manual override of last resort. Not implemented                  |

Field shape is the load-bearing signal, exactly as it is for the row form
(`isLegacyEdgesFrame`, `src/lib/echarts/converters/legacyToWide.ts`), and for the same
reason: provisioned `csv_content` fixtures and SQL Expression outputs can set neither
`meta.type` nor a frame name.

The shape test, in order:

1. A frame whose numeric fields carry **both** endpoint label keys (default `source`
   and `target`) is an **edges** frame.
2. Otherwise a frame whose numeric field names **split on `-->`** is an **edges** frame.
3. Otherwise, in a response that already has an edges frame, a remaining frame with
   numeric fields **naming a known endpoint** is a **nodes** frame. The endpoint test is
   load-bearing: without it a second query returning `cpu` would add a disconnected `cpu`
   node.
4. A lone nodes frame is a table, not a graph — an edges frame is required, as in the
   long form.

For precedent on signal 3, see XY chart's series editor and geomap's layer/query
pairing, both of which put a per-query selector in panel options.

### A role is one-to-many

Nothing above says _one frame per role_, and the reader does not read it that way: **every**
frame a role claims contributes its marks. That is what makes the
[Multi variant](#row-dimension-variants) readable at all, and it is the only place a
response carrying two edges frames can be unioned — `joinByField` cannot merge two
already-wide frames without colliding their names.

Two rules make the plural reading well-defined:

- **Declared wins as a _filter_.** If any frame declares `graph-edges-wide`, only declared
  frames are collected and the shape test is never consulted; likewise for
  `graph-nodes-wide`. This is `meta.type` being authoritative in the negative direction —
  a frame that says what it is is never mixed with frames that were merely guessed at.
- **The nodes search excludes every edges candidate**, collected or not, and where two nodes
  frames declare the same node the **first field wins**. A node id is the ECharts graph key,
  so a repeated declaration is a real collision rather than a display problem; response
  order is the only stable tie-break.

The endpoint set the nodes search runs against is the **union** over every collected edges
frame.

Edge ids, by contrast, may repeat — see
[Identity](#identity-display-names-and-override-targeting). The reader never mints one.

## Frame meta

Field shape is enough to _render_. Frame meta is what makes the kind **discoverable**,
and it buys three things field shape cannot. A datasource emitting this kind should set
all three where it can.

| Meta key                          | Value                                       | What it buys                                                                  |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `meta.type`                       | `'graph-nodes-wide'` / `'graph-edges-wide'` | Unambiguous role resolution, and **suggestions** — see below                  |
| `meta.typeVersion`                | `[0, 1]`                                    | The contract spec's own versioning rule for a kind that has not stabilised    |
| `meta.preferredVisualisationType` | `'nodeGraph'`                               | Routing in Explore, and continuity with the row form's only routing signal    |
| `meta.custom.graph`               | `{ sourceKey?, targetKey? }`                | Lets a datasource declare `client`/`server` instead of forcing a panel option |

### This is what unlocks suggestions

`src/modules/relations/suggestions.ts` used to be permanently silent, on the stated ground
that _"`PanelDataSummary` exposes neither field names nor that meta signal"_. **That was
out of date for 13.1.1.** `getPanelDataSummary`
(`@grafana/data/panel/suggestions/getPanelDataSummary`) exposes:

- `hasDataFrameType(type)` — a `Set` populated from every frame's `meta.type`;
- `hasPreferredVisualisationType(type)` — same, from `meta.preferredVisualisationType`;
- `rawFrames` — _"pass along a reference to the DataFrame array in case it's needed by the
  plugin"_, so field names are reachable after all.

So a wide graph frame that sets `meta.type` is directly suggestable
(`summary.hasDataFrameType('graph-edges-wide')`), and the **row** form is suggestable via
`hasPreferredVisualisationType('nodeGraph')` — which Tempo, AWS X-Ray and TestData all set
(verified: TestData `node_graph` frames carry
`meta.preferredVisualisationType: 'nodeGraph'` and no `meta.type`). Neither needs a core
change, and `scoreRelations` now scores from those signals.

Note the ceiling on the shape-only path: a wide edges frame with no meta is
indistinguishable from any other `numeric-wide` frame _by summary alone_ — the label keys
and the separator live in field names and labels, which only `rawFrames` exposes. So meta
is the difference between a cheap suggestion and one that has to walk the frames.

### And it is what makes migration detectable

A panel deciding between the long and wide readers has to answer "which is this?" on every
render. With `meta.type` the answer is one string comparison; without it, it is the field-shape
walk in [Frame role resolution](#frame-role-resolution). More importantly, `meta.type`
makes the _transition_ legible: a datasource can start emitting `graph-edges-wide` while
old dashboards still receive the long form, and both panels can tell which they got
without heuristics. `typeVersion` then gives the kind room to change shape before it is
minted.

**What meta cannot do:** it does not survive `csv_content`, SQL Expressions, or any
transformation — `rowsToFields` builds its output frame from scratch and sets only
`refId` (verified: `{ fields, length: 1, refId: 'rowsToFields-<refId>' }`, no `meta`). So
field shape stays the load-bearing signal for every reshaped path, and meta is an
optimisation for datasources that emit the kind natively.

**One friction until the kind is minted.** Both `QueryResultMeta.type` and
`hasDataFrameType(type)` are typed as the `DataFrameType` enum, not as `string`
(`@grafana/data/types/data.d.ts`, `types/dataFrameTypes.d.ts`), so writing or testing an
unminted value needs a cast — `meta: { type: 'graph-edges-wide' as DataFrameType }`.
Runtime is unaffected: the setter is a plain assignment and the test is a `Set.has`, both
of which accept any string. This is a nuisance, not a blocker, and it disappears the day
`DataFrameType.GraphEdgesWide` is added upstream.

## Edges frame — `graph-edges-wide`

Required. One numeric field per edge.

| Element                                                                | Carries                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| One **`number`** field per edge                                        | The edge. Its values are the edge's weight over the row dimension                                                                |
| `field.name`                                                           | **Edge id, and the stable override target.** Must be meaningful — see [Identity](#identity-display-names-and-override-targeting) |
| `field.labels[sourceKey]` / `[targetKey]`                              | Endpoints. Keys are configurable (default `source` / `target`) so Tempo's `client` / `server` works unchanged                    |
| Field-name split on `-->`                                              | Endpoint **fallback**, for sources that cannot emit labels — see [The separator](#the-separator)                                 |
| Optional leading `time` **or** `string` field                          | The row dimension. Absent ⇒ single-row instant data, as the long form always is                                                  |
| `config.displayName`                                                   | Edge label                                                                                                                       |
| `config.color`                                                         | Edge colour — **all eight modes**, including by-value over the edge's own values                                                 |
| `config.links`                                                         | Per-edge data links                                                                                                              |
| `config.unit` / `decimals` / `mappings` / `thresholds` / `min` / `max` | Tooltip formatting and data-driven colour, per edge                                                                              |
| `config.custom.lineWidth`                                              | `lineStyle.width` — replaces `thickness`                                                                                         |
| `config.custom.lineType`                                               | `lineStyle.type` (`solid` / `dashed` / `dotted`) — replaces `strokedasharray`                                                    |
| `config.custom.curveness`                                              | `lineStyle.curveness`, per edge on all three variants                                                                            |
| `config.custom.hideFrom`                                               | Per-edge visibility (`viz` / `legend` / `tooltip`)                                                                               |

### The separator

**Normative: the separator is exactly the three ASCII bytes `2D 2D 3E`.** No other form is
accepted — not `->`, not `→`, not `=>`.

**Why exactly one form, and why this one.** An earlier draft accepted `->`, `-->` and `→`.
That is ambiguity paid for by every consumer, for three measured reasons:

- **`->` is a substring of `-->`**, so a reader accepting both must match longest-first.
  A shortest-first scan splits `a-->b` into `a-` / `b`, silently. Worse on real names:
  `my-svc-->other-svc` becomes `my-svc-` / `other-svc`, and `my-svc-` matches no node.
  One separator removes the class of bug rather than documenting a rule against it.
- **`->` collides with hyphenated names in general.** Kubernetes services, Prometheus job
  names and SQL identifiers are full of hyphens; `-->` is far less likely to occur inside
  a node id than `->` is.
- **`→` is untypeable** in a Prometheus legend field, a SQL string literal or a CSV header
  without a compose key or a paste, so it can never be the primary form; accepting it only
  as an alias buys nothing and costs a second code path.

`a-->b-->c` is still ambiguous — a node genuinely named `a-->b` produces it. The rule is
**first separator wins**, giving `a` and `b-->c`; see
[Separator collision](#separator-collision). Labels have no such problem, which is why
they are the primary carrier.

Confirmed end to end as `csv_content` headers, with a `byName` override targeting exactly
one column in each case:

```csv
a-->b,b-->c
420,380
```

```csv
my-svc-->other-svc,other-svc-->db
12,20
```

### Endpoint precedence, and the cost of two carriers

Labels first, name-splitting second. A frame may carry both; **labels win**. That is one
precedence rule, and it is the entire cost of supporting two carriers in a reader:

```ts
const endpoints = (f: Field) =>
  f.labels?.[sourceKey] && f.labels?.[targetKey]
    ? [f.labels[sourceKey], f.labels[targetKey]]
    : splitOnFirst(f.name, '-->');
```

The full trade, because [dropping name-splitting entirely](#could-labels-be-the-only-carrier)
is a live option:

| Dimension                        | Labels                                                                                             | Name-split                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Authorable in raw CSV            | Only via a JSON column + **Extract fields** — see [below](#labels-from-a-csv-datasource-after-all) | **Yes** — one header line, no transformations                 |
| Parallel edges                   | **Yes** — ids stay distinct, endpoints repeat                                                      | **No** — see [Parallel edges](#parallel-edges-require-labels) |
| Separator collision              | Immune                                                                                             | Possible (`a-->b-->c`)                                        |
| Identity independent of topology | **Yes** — rename an edge without moving it                                                         | **No** — `field.name` does double duty                        |
| Prometheus / Loki, zero reshape  | **Native** — `client` / `server` arrive as labels                                                  | Needs a `legendFormat` to build the name                      |
| SQL / CSV via `rowsToFields`     | **Native** — unmapped columns become labels                                                        | Needs the id column to be pre-concatenated                    |
| Reader cost                      | —                                                                                                  | ~15 lines and one precedence rule                             |
| Doc / fixture cost               | Every example needs two transforms                                                                 | Every example is one CSV line                                 |

#### Labels from a CSV datasource, after all

"CSV cannot express labels" is true of a header cell and false of the pipeline. A JSON
column plus core's **Extract fields** produces genuine labels, with no datasource change and
no new API. Verified end to end in a live panel:

```csv
id,meta,mainstat
e1,"{""source"":""a"",""target"":""b""}",10
e2,"{""source"":""a"",""target"":""b""}",20
e3,"{""source"":""b"",""target"":""c""}",30
```

| Step | Transformation                                  | Effect                                                                |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1    | **Extract fields** — source `meta`, format JSON | adds `source` and `target` **columns** (not labels — columns)         |
| 2    | **Organize fields** — exclude `meta`            | drops the raw JSON column, so it does not itself become a label       |
| 3    | **Convert field type** — `mainstat` → number    | required, as always, before `rowsToFields`                            |
| 4    | **Rows to fields** — no options                 | `id` → field name, `mainstat` → value, `source`/`target` → **labels** |

Observed output: three fields named `e1`, `e2`, `e3`, displaying as
`e1 {source="a", target="b"}` / `e2 {source="a", target="b"}` /
`e3 {source="b", target="c"}` — i.e. **two parallel edges with distinct ids and identical
endpoints**, which is the one shape the name-split form cannot express. A `byName: 'e2'`
override applied a unit to exactly the second edge and nothing else.

Two notes on typing. A CSV cell arrives as `string`, and `extractFields` parses it happily.
A datasource that emits a real object gets `FieldType.other`, and `extractFields` handles
that identically (verified with a `toDataFrame` fixture) — so a JSON API or Infinity
datasource returning `{"source": "a", "target": "b"}` needs no stringification.

**A very small core enhancement would remove the chain entirely.** Grafana's CSV reader
recognises exactly two special header keys — `#name#` and `#unit#` (`utils/csv.mjs`, where
the guard is `isName || headerKeys.hasOwnProperty(k)` over `{ unit: '#' }`). A `#labels#`
line would let `csv_content` express labels directly — **this does not work today**, which
is why it is not fenced as `csv` like every other example in this doc:

```text
#labels#source=a target=b,source=a target=b
e1,e2
10,20
```

That is a handful of lines in `@grafana/data`, benefits every fixture and test in Grafana
rather than just graph frames, and needs no schema, toggle or dashboard change. Worth
proposing on its own merits; the contract does not depend on it.

#### Could labels be the only carrier?

Yes, and it is close. Every property in the table above favours labels except the last two
rows, so the question reduces to: **is raw-CSV authorability worth one branch?**

What labels-only would cost, concretely:

| Cost                                                                                   | Weight                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `csv_content` fixture expresses an edges frame in one line                          | Real but softer than it looks. A JSON column plus Extract fields does work ([recipe](#labels-from-a-csv-datasource-after-all)) — but every wide example in this doc and every panel in the proof dashboard would grow from one CSV line to a four-transformation pipeline |
| Hand-written unit fixtures unaffected                                                  | None — `toDataFrame` sets `labels` directly, so the jest suites are indifferent                                                                                                                                                                                           |
| Prometheus / Loki / SQL unaffected                                                     | None — all three produce labels natively                                                                                                                                                                                                                                  |
| A user hand-typing a wide frame in Explore's TestData panel cannot make an edges frame | Real but narrow                                                                                                                                                                                                                                                           |

What it would buy:

| Benefit                               | Weight                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| No separator anywhere in the contract | Removes the collision rule, the ligature question and the hyphen hazard outright |
| Parallel edges always expressible     | The one capability regression against the long form disappears                   |
| `field.name` is purely identity       | An edge can be renamed without moving; an id need not look like `src-->dst`      |
| One code path in every reader         | ~15 lines, but more importantly one fewer documented failure mode                |

**Decision: keep both, with labels normative and name-splitting explicitly demoted.** The
deciding argument is not the 15 lines — it is that a contract nobody can write down by hand
is a contract nobody checks. Every worked example in this doc is a pasteable CSV, the proof
dashboard renders from CSV, and that is what makes the claims falsifiable by a reader in
under a minute. Labels-only would push every one of them behind a four-transformation
pipeline whose own behaviour then has to be trusted.

The [JSON-column recipe](#labels-from-a-csv-datasource-after-all) sharpens rather than
settles this: it proves labels are _reachable_ from any datasource, so nothing is
capability-blocked by keeping the shortcut. Name-splitting stays as the one-line form for
fixtures and docs; labels stay the conformant form for anything real. Both are exercised, so
neither rots.

The demotion is what keeps this from being ambiguity:

1. **Labels are the conformant carrier.** A datasource or transformation emitting this kind
   MUST use labels. `legacyToWide` MUST emit labels.
2. **Name-splitting is a `csv_content`-class authoring shortcut**, permitted so fixtures and
   documentation stay writable. Readers MUST support it, MUST prefer labels when both are
   present, and MUST use first-separator-wins.
3. Its two limitations are **normative, not incidental**: it cannot express parallel edges,
   and a node id containing `-->` is not representable.

If that judgement is wrong, it reverses in one place — delete the `splitOnFirst` branch
above, delete this section and the [separator](#the-separator) section,
and convert the worked examples to `rowsToFields` panels. Nothing else in the contract
depends on it.

## Nodes frame — `graph-nodes-wide`

Optional, exactly as in the long form — the node set is derived from the edges when it
is absent. One numeric field per node.

| Element                                                 | Replaces (long form)                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| One **`number`** field per node; `field.name` = node id | `id` column                                                                             |
| Reduced value from `reduceOptions.calcs[0]`             | `mainstat`                                                                              |
| Reduced value from `reduceOptions.calcs[1]`             | `secondarystat`                                                                         |
| `config.displayName`                                    | `title`                                                                                 |
| `config.color.fixedColor`                               | `color`, string form                                                                    |
| `config.color.mode` + `thresholds` / `mappings`         | `color`, **numeric** form — specced in the row form and never implemented by any reader |
| `config.links`                                          | _no equivalent_ — the gap `todo/relations-data-links.md` names, closed here per mark    |
| `config.unit` / `decimals`                              | per-node stat formatting; the long form has one unit for the whole column               |
| `config.custom.nodeRadius`                              | `noderadius`                                                                            |
| `config.custom.subtitle`                                | `subtitle`                                                                              |
| `config.custom.icon`                                    | `icon`                                                                                  |
| `config.custom.fixedX` / `.fixedY`                      | `fixedx` / `fixedy`                                                                     |
| `config.custom.hideFrom`                                | _no equivalent_ — and reachable now: the real `addHideFrom` hides one node or one edge  |
| `field.labels`                                          | `detail__*`                                                                             |
| `config.thresholds` steps                               | `arc__*` — an approximation, see [Pitfalls](#pitfalls)                                  |

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

**That last sentence has a consequence the `calcs[1]` mapping has to own: on the instant
form a secondary stat is not expressible.** `calcs[0]` and `calcs[1]` reduce the same single
value and therefore return it twice. Two calcs are two _views of one series_, which is not
what the long form's `mainstat` / `secondarystat` are — Tempo's are average response time and
requests per second, two independent measurements. So `calcs[1]` replaces `secondarystat`
only on the [ranged](#row-dimension-variants) variant. On instant data a second stat needs a
second carrier: a label (what a native pivot produces, at the cost of its type and unit), or
a second numeric field excluded from the mark matcher via `reduceOptions.fields`. Measured in
[What a native pivot cannot carry](#what-a-native-pivot-cannot-carry).

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
| `a-->b`, no labels                                        | `a-->b`                       |
| `a-->b` twice in one frame                                | `a-->b 1` and `a-->b 2`       |

So: **the contract requires a meaningful `field.name`**, and overrides should target it.
`rowsToFields` with `id` as the name field satisfies this by construction. A field named
`Value` degrades its display name to the raw label set, and — worse — makes
`byName: 'Value'` match **every** edge at once (verified against a Prometheus-shaped
response).

The override picker makes the stable choice available: for a labelled frame it lists
both `e1 {source="a", target="b"}` and `e1 (base field name)`, and choosing the latter
persists `{ matcher: { id: 'byName', options: 'e1', scope: 'series' } }`, which survives
a save and reload.

### The reader never mints an id

`RelationLink.id` is `field.name`, always — including when several collected marks share
it, which is exactly what N raw `Value` frames produce
([Multi](#row-dimension-variants)). A synthesised `a-->b` would look addressable and not
be: `byName`/`byNames` compare against `field.name` or the display name, and neither is a
minted string. Worse, the panel's override universe (`getOverrideTargetNames`) feeds an
**exclude** matcher, so an id no field answers to there stops the kept list covering the
edge fields and hiding one node erases every link in the panel.

What duplication actually breaks is one thing: the tooltip's item-to-field lookup, which
would be last-write-wins keyed by id. The reader mints a **`markKey`** for that — an
internal item key, unique per render, minted from the endpoints, then the label set that
tells parallel edges apart, then `#n` (the same ladder the pivot names fields with). It is
never rendered and never matched against, so its stability bar is far lower than an id's.

What stays lost, and is documented rather than fixed:

- `byName` on the raw name cannot target one edge of a `Value`-named response;
- the override picker lists `Value` once per frame — honest, and ugly;
- `palette-classic-by-name` would hash N `Value` fields to one colour. It does not bite
  today, because edges discard palette modes and derived nodes have no field.

### Two normative rules

1. **Cycle and self-loop handling is unchanged.** The sankey DAG restriction is an
   ECharts constraint, not a contract one. `converters/dag.ts` still breaks cycles and
   drops self-loops for the sankey variant; `graph` and `chord` still render both. The
   pivot does not fix, worsen or interact with this.
2. **Parallel edges require labels.** Two edges over the same pair cannot be two
   identically named fields — see [below](#parallel-edges-require-labels).

## Row dimension variants

The row dimension is what the mark's values are indexed by. All three forms are the same
kind; they differ only in frame count and in whether a leading dimension field exists.

| Variant                         | Shape                                               | Row dimension   | Notes                                                                                   |
| ------------------------------- | --------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| **Instant** (canonical)         | One frame, no leading field, `length: 1`            | none            | What `rowsToFields` always produces. The reduce is a no-op                              |
| **Ranged**                      | One frame, leading `time` or `string` field         | time / category | A range query needs no aggregation — `calcs[0]` reduces it. Renders in core Time series |
| **Multi** (`graph-edges-multi`) | One frame **per edge**, value field usually `Value` | time            | The natural Prometheus/Loki `time_series` shape                                         |

The multi variant **renders in full, with no transformation and no host feature flag**: the
reader collects every frame the shape test claims (see
[A role is one-to-many](#a-role-is-one-to-many)), so ten series are ten edges. This is the
shape a native producer is most likely to emit, and the shape `sum by (source, target) (…)`
in `Format: Time series` returns today.

Its hazard is **identity**, and it is the one named above. Each frame's value field is
called `Value`, so the marks share one `field.name`:

- `byName: 'Value'` hits **every** edge at once, and the override picker lists one `Value`
  entry per frame;
- the display-name route does address one edge — a field named exactly `Value` contributes
  nothing to its own display name, so what is left is its label set,
  `{source="a", target="b"}` — but only until a legend format is added, at which point
  `displayNameFromDS` wins.

`getFieldDisplayName` does **not** rescue this by substituting the frame name. Measured
false for the shape that matters: a Prometheus range query sets no frame name at all, and
the frame-name prefix only applies when `allFrames.length > 1` _and_ consecutive frames
carry different `.name`. With no names there is no prefix and no ordinal —
`getUniqueFieldName`'s `1`/`2` suffixes are frame-local, so N one-field frames get none.

The fix for identity is at the source — a legend format, or the `graph-edges-wide` pivot
above the panel (`converters/longToWide.ts`) — not in the reader, which cannot create a
field for an override to land on. Internally the reader mints a `markKey` per colliding
mark so the tooltip still resolves each edge's own unit, decimals and `config.links`; that
key is never rendered and never matched against.

## Single-frame prefix variant — considered, not adopted

For sources that can emit neither `meta` nor labels and cannot run two queries, one
frame could carry both roles using field-name prefixes:

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

## Complete mapping from `graph-*-long`

Every field in [graph-long.md](../../../data-plane/graph-long.md)'s two tables, with its
wide equivalent or the reason it has none. Acceptance required this table to be exhaustive.

### Edges

| Long form         | Wide form                                     | Note                                                                                                      |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`              | `field.name`                                  | Becomes the override target, which the long form's `id` never was                                         |
| `source`          | `field.labels.source`, or the name split      | Label key configurable                                                                                    |
| `target`          | `field.labels.target`, or the name split      | Label key configurable                                                                                    |
| `mainstat`        | the field's **values**, reduced by `calcs[0]` | Cannot be a string any more — a field has one type, and the mark's field is numeric                       |
| `secondarystat`   | `calcs[1]`                                    | Same field, second reducer — **ranged variant only**; on instant data both calcs return the same value    |
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
| `secondarystat`  | `calcs[1]`                                   | **Ranged variant only.** On an instant frame both calcs reduce the same value — see [the `reduceOptions` contract](#the-reduceoptions-contract)                                                     |
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

**Whether a transformation can _produce_ these rows is a separate question from whether the
contract can express them, and the answer is narrower than the tables suggest.** Every
`config.custom.*` row above, in both tables, plus `config.links`, is unreachable by any core
transformation: `configMapHandlers` has no handler that writes into `custom` or `links`. Under
a native pivot those columns degrade to `field.labels`. Measured, with the full list, in
[What a native pivot cannot carry](#what-a-native-pivot-cannot-carry); what it implies for how
the conversion must be implemented is in
[adhoc-transformations-split.md](../../../todo/adhoc-transformations-split.md#why-the-return-type-is-a-union-and-why-the-union-is-free).

## Sourcing

The full picture is in [../docs/relations-data-sources.md](../../../docs/relations-data-sources.md).
The short version, because it is the sharpest practical argument for the contract:

### Prometheus / Loki — zero reshaping

```promql
sum by (client, server) (rate(traces_service_graph_request_total[$__range]))
```

Run it **instant**, `format: time_series`, with a legend format:

```
{{client}}-->{{server}}
```

That is the whole recipe. Each series is one frame, one edge; the legend format lands in
`config.displayNameFromDS`, which `getFieldDisplayName` returns verbatim, so the display
name **is** the edge id and `byName: 'a-->b'` targets exactly one edge (verified). The
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

#### Reality check: the natively-long producers are the awkward case

Auto-detection is a clean fit for a hand-written table and a poor fit for a real
service-map response. Measured against TestData `node_graph` `response_small`, which is a
saved AWS X-Ray service map and therefore the best available proxy for what Tempo and
X-Ray actually emit:

| Frame | Fields as returned                                                                                      | Zero-config `rowsToFields` gives                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| nodes | `id`, `title`, `subtitle`, `mainstat` (number), `secondarystat`, `arc__success/faults/errors/throttled` | 17 fields named **`0` … `16`** — the ids are numeric strings — with the service name demoted to a `Name` label |
| edges | `id`, `source`, `sourceName`, `target`, `targetName`, `mainstat` (**string**), `secondarystat` (number) | 18 fields named `0__2`, `5__8`, … and the value taken from **`secondarystat`**, because `mainstat` is a string |

Both outputs are structurally valid and semantically poor: the override targets are
`0`, `1`, `2`, and the edge value is transactions-per-minute rather than the response
percentage the panel would have shown. Fixing it takes explicit mappings —
`title` → **Field name**, `sourceName`/`targetName` as the endpoint label keys — i.e. four
mappings across two transforms, not zero config.

So the sourcing claim needs stating precisely: **the wide form is dramatically cheaper to
source from Prometheus, Loki and SQL, and modestly more fiddly to source from the
datasources that already emit the long form natively.** That population — Tempo, AWS
X-Ray, TestData — is exactly the one that
[dropping long support](../../../todo/graph-wide-migration.md#dropping-long-support-entirely)
would strand.

### What a native pivot cannot carry

Measured by running core's real `rowsToFields` over a legacy nodes + edges pair carrying
every optional column — `arc__*`, `icon`, `noderadius`, `detail__*`, `color`,
`strokedasharray` — which is the shape TestData's `node_graph` scenario emits and, minus
`icon`/`noderadius`, what Tempo's service graph emits (`graphTransform.ts`,
`createServiceMapDataFrames`, v13.1.0). Verbatim v13.1.0 transformer sources against
`@grafana/data` 13.1.1.

**The edges frame pivots cleanly with zero options.** Given
`id, source, target, mainstat, color, strokedasharray`:

```text
field "service:1--service:2"  number  [97.98148256679684]
  labels: { source: "service:1", target: "service:2" }
  config: { color: { fixedColor: "blue", mode: "fixed" } }
```

Name is the edge id, endpoints are in labels — the conformant carrier — and the legacy
`color` column auto-promotes to real overridable field config ([#1c](#verified-behaviours)).
Two details worth keeping: `strokedasharray` vanishes entirely because its values array was
empty and `getLabelsFromRow` skips `value == null`; and the edge id is `service:1--service:2`
with a **double hyphen**, which the [separator](#the-separator) rule does not split — so
labels are not merely preferred here, they are the only thing that resolves the endpoints.

**The nodes frame pivots to something structurally valid and semantically hollow.** Given
`id, title, subtitle, mainstat, secondarystat, arc__success, arc__errors, icon, noderadius, detail__test_value`:

```text
field "service:1"  number  [0.2637226215903159]
  labels: { title: "Service 1", subtitle: "Foo", "Average duration": 0.7058…,
            Success: 1, Errors: 0, icon: "", noderadius: 40 }
  config: {}
```

`config` is **empty**. Everything except `id` and `mainstat` became a label.

#### The ceiling is `configMapHandlers`, and it is closed

`configMapHandlers`
(`public/app/features/transformers/fieldToConfigMapping/fieldToConfigMapping.ts`) is a
hard-coded list of thirteen. Its target properties, dumped at runtime:

```text
field.name, field.value, field.label, __ignore,
max, min, unit, decimals, displayName, color, thresholds, mappings ×3
```

**No `custom`. No `links`.** So against the
[complete mapping tables](#complete-mapping-from-graph--long):

| Long column         | Wide target                 | Reachable by any transformation?                                             |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `color`             | `config.color`              | **Yes, automatic** — lowercased column name hits the `color` handler         |
| `title`             | `config.displayName`        | Yes, one explicit mapping                                                    |
| `arc__*`            | `config.thresholds`         | Mechanically, not meaningfully — see below                                   |
| `subtitle`          | `custom.subtitle`           | **No**                                                                       |
| `icon`              | `custom.icon`               | **No**                                                                       |
| `noderadius`        | `custom.nodeRadius`         | **No**                                                                       |
| `strokedasharray`   | `custom.lineType`           | **No**                                                                       |
| `thickness`         | `custom.lineWidth`          | **No**                                                                       |
| `fixedx` / `fixedy` | `custom.fixedX` / `.fixedY` | **No**                                                                       |
| —                   | `config.links`              | **No** — the headline capability of the pivot, unreachable by transformation |

Everything in the **No** rows lands in `field.labels` instead, or vanishes. This is why the
contract's `custom.*` column cannot be sourced by a user-added transformation and why the
conversion has to be a `CustomTransformOperator` rather than a `rowsToFields` config — see
[graph-wide-migration.md](../../../todo/graph-wide-migration.md#the-adapter-decision) and
[adhoc-transformations-split.md](../../../todo/adhoc-transformations-split.md#why-the-return-type-is-a-union-and-why-the-union-is-free).

#### Three losses that are not handler gaps

- **`secondarystat` is unrepresentable in the instant form.** This contract maps it to
  `calcs[1]`, but the pivot output is `length: 1`, so `calcs[0]` and `calcs[1]` reduce the
  same single value and must agree — as [the `reduceOptions` contract](#the-reduceoptions-contract)
  itself concedes. A node with two genuinely different stats (Tempo: average response time
  _and_ requests per second) keeps one as its value; the other survives only as a label,
  losing its type, unit and decimals. The `calcs[0]`/`calcs[1]` mapping is sound only for the
  **ranged** variant, where the two calcs are different reducers over one series.
- **The value column's own config is discarded.** Measured `config: {}` even when the input
  `mainstat` carries `displayName`, `unit: 'ms/r'` and `decimals: 2`. The output config is
  built purely from row _values_ through handlers; `getFieldConfigFromFrame` never copies the
  source field's config. Tempo ships units on both stat columns and they do not survive.
- **Frame identity is destroyed.** The output is `{ fields, length, refId }` and nothing else.
  `meta` is dropped, so `preferredVisualisationType: 'nodeGraph'` is lost and
  `meta.type: 'graph-edges-wide'` can never be set by a transformation. `name` is dropped, so
  the `nodes` / `edges` frame names are gone and role resolution falls back to field shape
  (which does work: only the edges output carries `source`/`target` labels). And `refId`
  becomes `rowsToFields-${data.refId}` — on frames that carry no `refId`, as TestData's do,
  **both** outputs come out as the literal `rowsToFields-undefined`, so they are no longer
  distinguishable by refId. That breaks [signal 3](#frame-role-resolution) and any downstream
  `filterByRefId`.

#### `arc__*` to thresholds, measured

It works further than expected and is still not a rendering of the arcs. Two mappings both
keyed `threshold1` each push a step, with per-mapping colours:

```text
service:2: { mode: "absolute", steps: [ {value: 0.2776, color: "green"}, {value: 0.7224, color: "red"} ] }
```

But there is no `-Infinity` base step, the steps are pushed in field order rather than sorted
ascending, the values are proportions on a domain the node's own value (0.26) does not share,
and the green/red came from the _mapping arguments_ — the arc columns' own
`config.color.fixedColor` is never read. So it is a config-shaped artefact, which is what
[the mapping table](#nodes) means by _approximation_.

#### Two traps in `rowsToFields` itself

1. **Mappings are keyed by the field's _display name_, not its name.**
   `evaluateFieldMappings` computes `getFieldDisplayName(field, frame)` and uses it both for
   the auto lookup (lowercased) and to match `mapping.fieldName`. Legacy producers set
   `config.displayName` on exactly the stat and arc columns, so the mapping for `mainstat`
   must be written against `'Transactions per second'` (TestData) or
   `'Average response time'` (Tempo) — never `'mainstat'`. It follows that **a pivot recipe
   is not portable between datasources**, because it is keyed on strings the datasource chose.
2. **Getting that wrong silently no-ops the whole transformation.** Measured with
   `{ fieldName: 'mainstat', handlerKey: 'field.value' }`: the returned object is the input
   frame, identically (`out === input`, ten fields, `length: 2`). Because a `field.value`
   mapping exists, the auto-pick-first-numeric branch is suppressed; nothing matches the raw
   name; `valueField` stays undefined; and `if (!nameField || !valueField) return data`. The
   panel then receives a legacy frame, which is where the relations family throws. There is no
   warning.

Two smaller observations for a reader: label **values** are whatever the cell held, so
`noderadius: 40` and `Success: 1` are real numbers inside a `Labels` typed
`Record<string, string>`; and auto-detection is positional — first `string` field, first
`number` field, in field order — so a frame that put `arc__success` before `mainstat` would
make an arc proportion the node's value.

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
a-->b,a,b,420
b-->c,b,c,380
```

Wide edges frame:

```csv
a-->b,b-->c
420,380
```

Two fields, one per edge. The field name is the edge id _and_ the override target;
endpoints parse out of it. Renders as `graph`, `sankey` or `chord`.

### 2. Cycle and self-loop — 2 nodes, 3 edges

Legacy:

```csv
id,source,target,mainstat
a-->b,a,b,420
b-->a,b,a,380
a-->a,a,a,90
```

Wide:

```csv
a-->b,b-->a,a-->a
420,380,90
```

Structurally identical, and **the contract change does not touch cycle handling**
(normative rule 1). The sankey path still drops the self-loop and one back-edge;
`graph` and `chord` still draw all three.

### 3. Fan-out / fan-in DAG — 4 nodes, 4 edges

Legacy:

```csv
id,source,target,mainstat
a-->b,a,b,60
a-->c,a,c,40
b-->d,b,d,60
c-->d,c,d,40
```

Wide:

```csv
a-->b,a-->c,b-->d,c-->d
60,40,60,40
```

Four independently overridable ribbons. Colouring only `a-->c`, or curving only it, is
impossible in the long form and is one `byName` override here.

The same fixture with a **categorical row dimension** — a leading `string` field, which
is what lets a core Bar chart render it and is how the proof dashboard shows the
per-edge overrides:

```csv
row,a-->b,a-->c,b-->d,c-->d
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
a-->b,a,b,10
a-->c,a,c,20
b-->a,b,a,30
b-->c,b,c,40
c-->a,c,a,50
c-->b,c,b,60
```

Wide, edge-per-field:

```csv
a-->b,a-->c,b-->a,b-->c,c-->a,c-->b
10,20,30,40,50,60
```

Six fields for three nodes — the N·(N−1) growth, which is the dense-graph risk in
concrete form. At 30 nodes it is 870 fields. With a categorical row dimension, as the
proof dashboard renders it:

```csv
row,a-->b,a-->c,b-->a,b-->c,c-->a,c-->b
total,10,20,30,40,50,60
```

### 6. Two hazards the wide form introduces

#### Parallel edges require labels

The long form tolerates two rows over the same pair:

```csv
id,source,target,mainstat
e1,a,b,10
e2,a,b,20
```

Three encodings are possible in the wide form. Only one is recommended, and the reasons
are measured rather than aesthetic.

**(a) Duplicate field names — legal, individually targetable, but positional.** Two
fields may share a name; a frame really does end up with two `Field` objects whose
`name` is identical:

```csv
a-->b,a-->b
10,20
```

`getUniqueFieldName` disambiguates only the **display** name, appending an ordinal to
_every_ duplicate — so two fields display as `a-->b 1` and `a-->b 2`, three display as
`1` / `2` / `3`. Measured matcher behaviour:

| Override            | Matches                              |
| ------------------- | ------------------------------------ |
| `byName: 'a-->b'`   | **both** fields (it is the raw name) |
| `byName: 'a-->b 1'` | the first only                       |
| `byName: 'a-->b 2'` | the second only                      |

Confirmed by applying overrides: field 0 took `dark-red` from `a-->b 1`, field 1 took `ms`
from `a-->b 2`. Confirmed again in a live panel over `csv_content` of `a-->b,a-->b` /
`10,20`: the columns render as `a-->b 1` and `a-->b 2`, `byName: 'a-->b 2'` formats the
**second cell only** (`10`, `20 ms`), and `byName: 'a-->b'` formats **both**.

So this works — but the ordinal is **positional within the frame**. Insert a new parallel
edge ahead of an existing one and every subsequent override silently retargets. And the
name split still sees `a-->b`, so the endpoints parse correctly here only because both
edges share them.

**(b) Multiple values in one field — wrong shape.** A field named `a-->b` with values
`[12, 20]` is **one** edge sampled twice, not two edges: measured, that frame has one
numeric field, `length: 2`, and one display name. That is the
[ranged row dimension](#row-dimension-variants), which is a different and legitimate
thing. It cannot express two parallel edges, because there is only one mark to configure.

**(c) Distinct ids with endpoints in labels — recommended.** Keep the ids as names and
put the endpoints in labels, which CSV cannot do — so this shape is `rowsToFields`-only:

```csv
e1,e2
10,20
```

Both fields carry `labels: {source: 'a', target: 'b'}`, display as
`e1 {source="a", target="b"}` / `e2 {source="a", target="b"}`, and `byName: 'e2'` matches
exactly one (measured). Nothing is positional.

This is the one shape where the wide form is harder to author than the legacy one. The
`legacyToWide` adapter must therefore emit **id-named fields with labels**, not name-split
fields, whenever it detects a duplicate pair.

#### Separator collision

A node literally named `a-->b` produces the edge id `a-->b-->c`, which splits two ways.
The rule is **first separator wins**, giving `a` and `b-->c`.

This is the residual cost of the name-split form, and it is why the contract accepts only
`-->` rather than a set: a node id has to contain a literal `-->` to hit it, which is far
less likely than containing a `->`. Under the earlier three-form draft, the perfectly
ordinary `my-svc-->other-svc` mis-split into `my-svc-` / `other-svc` on any reader that
scanned for `->` first. One separator removes that class of bug entirely, leaving only the
contrived case above.

A node id that must contain `-->` is representable — just not in the name-split form. Use
labels.

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
    { name: 'a-->b', type: FieldType.number, values: [60, 55, 70] },
    { name: 'a-->c', type: FieldType.number, values: [40, 45, 30] },
  ],
});

/** graph-edges-multi — one frame per edge, the Prometheus `time_series` shape with a
 *  legend format of `{{client}}-->{{server}}`. */
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
        config: { displayNameFromDS: 'a-->b' },
      },
    ],
  }),
];
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
[node-graph.md](../../../data-plane/node-graph.md#echarts-data-specification) for the shared series table
and [echarts-coverage.md](../../../data-plane/echarts-coverage.md) for why `series.lines` is not fed by
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

### What the numbers say

**Long is the cheapest per mark, and it is not close.** A mark is a row — four array
slots — so 5 000 edges is still four fields and a 0.1 ms override pass. This is not a
surprise, and it is the honest cost of the pivot: **long is cheap precisely because
nothing in it is per-mark configurable.** There is no display processor to build, no
`config` object, no `labels` object and no picker entry per edge, because there is no
per-edge anything.

**Edge-per-field wide is the most expensive shape**, by roughly 200× on the override pass
at 5 000 marks. The cost is structural, not a missing optimisation: `applyFieldOverrides`
builds one display processor per field, and `cachingDisplayProcessor` keys its cache on
the value — so in the long form one processor is reused across 5 000 rows with a warm
cache, while in the wide form 5 000 processors are each called once and the cache never
pays. Its JSON payload is also ~2.4× the long form's, because a labels object per field
repeats the endpoint strings that a long row already carried once.

**ECharts is neutral.** All four relationship series are hand-built — `getInitialData`
reads `option.data`/`nodes`/`links` literally and never goes through `getSource()`, so a
`dataset` is invisible to them (see [echarts-coverage.md](../../../data-plane/echarts-coverage.md)). The
converter emits arrays either way, so the _same graph_ costs ECharts the same to lay out
and draw regardless of which frame shape produced it. Frame shape affects the columns in
the table above — the Grafana-side pipeline and the converter — and nothing downstream of
them. The one indirect effect: per-mark config means the converter calls E display
processors instead of one, which is the `per-mark resolve` column.

### Recommendation by scale

| Regime                                      | Use                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Up to ~500 marks                            | **Edge-per-field wide.** ~3 ms of pipeline for full per-mark configurability is not a trade worth thinking about                            |
| ~500 – 5 000 marks                          | Edge-per-field wide still works (~30 ms per render), but the **picker** is the bottleneck, not the pipeline. Prefer `byRegexp` at this size |
| Above ~5 000 marks with no per-mark styling | **Long.** It stays free, and if nothing is configured per mark there is nothing to gain by pivoting                                         |

The last row is the reason the contract does not claim the wide form is universally
better. It is better wherever per-mark configuration has any value, and it is worse
wherever it has none.

## Limits and divergences

- **Field-count ceiling — the UI degrades before the pipeline does.** Full numbers are in
  [Performance](#performance-which-frame-shape-is-cheapest). The binding constraint is the
  **override picker**, which lists the display name _and_ the raw base name for every
  field, so a 1 000-edge frame is a 2 000-entry combobox. It is virtualized — only ~13
  rows mount at a time — but on TestData's `node_graph` `response_medium` pivoted through
  `rowsToFields`, whose display names carry four labels each, opening it took **~4 s**.
  **Practical ceiling: a few hundred marks per frame**, and display-name _length_ matters
  as much as count. Beyond that, prefer `byRegexp` — remembering it tests the _display_
  name, so anchor patterns tolerantly (`/^db-/`, not `/^db-.*$/` against an id that
  carries labels).

- **Dense graphs are pathological in the edge-per-field form** (example 5): |E| grows as
  N·(N−1), so a 30-node chord is 870 fields.
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
- The row format, still supported: [graph-long.md](../../../data-plane/graph-long.md)
- The specification this record backs: [graph-wide.md](../../../data-plane/graph-wide.md)
- Node graph panel Data API (the published legacy contract):
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- Rows to fields transformation:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields
- Config from query results:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#config-from-query-results
- Field overrides (user-facing):
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- Field overrides in a panel plugin:
  https://grafana.com/developers/plugin-tools/how-to-guides/panel-plugins/field-overrides.md
- `rowsToFields` source (the auto-detection, the display-name keying and the label
  fall-through measured above):
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/rowsToFields/rowsToFields.ts
- `fieldToConfigMapping` source — the closed thirteen-handler list that is the ceiling on
  what any pivot can write:
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/fieldToConfigMapping/fieldToConfigMapping.ts
- `CustomTransformOperator` and the `transformDataFrame` union that accepts it:
  `@grafana/data` 13.1.1, `types/transformations.d.ts` and
  `transformations/transformDataFrame.d.ts`
- `configFromQuery` source (the one-row config reduction):
  https://github.com/grafana/grafana/blob/v13.1.0/public/app/features/transformers/configFromQuery/configFromQuery.ts
- Sourcing guide: [../docs/relations-data-sources.md](../../../docs/relations-data-sources.md)
- Rewrite plan: [../todo/graph-wide-migration.md](../../../todo/graph-wide-migration.md)
- Whether core's ad-hoc panel transformations would change the migration:
  [../todo/graph-wide-adhoc-transformations.md](../../../todo/graph-wide-adhoc-transformations.md)
- Per-item options, the problem this contract dissolves:
  [../todo/relations-item-overrides.md](../../../todo/relations-item-overrides.md)
- Family coverage overview: [echarts-coverage.md](../../../data-plane/echarts-coverage.md)
- Proof dashboard: `provisioning/dashboards/relations/graph-wide.json`
