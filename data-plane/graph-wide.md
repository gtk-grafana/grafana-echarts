# Graph data frame kind, wide

A **graph** is a set of **nodes** and the **edges** that join them. A response of this kind
carries an **edges** frame and, optionally, a **nodes** frame.

In the **wide** formats one mark is one **field**: one node is one field, one edge is one
field. A field's values are that mark's weight over the frame's row dimension, its `name`
is the mark's id, its `labels` carry the topology, and its `config` carries everything else
— colour, unit, decimals, thresholds, mappings, data links and per-mark style.

This is the graph counterpart of `numeric-wide`: a graph is a set of named numbers, plus
the statement of which pairs of names are joined.

> **Proposed kind.** `DataFrameType` in `@grafana/data` 13.1.1 has twelve members and none
> is graph-related, so nothing here redefines an existing kind. Per the contract's
> versioning rules these formats are at `typeVersion` `0.1` — well defined, but subject to
> change. See [Frame meta](#frame-meta).

Related kinds:

- [graph-long.md](./graph-long.md) — the row formats, `graph-nodes-long` /
  `graph-edges-long`, which every graph-native datasource emits today.
- [graph-matrix.md](./graph-matrix.md) — an adjacency-matrix edges format, proposed and
  rejected.

## Common properties

- A response has **one or more edges frames** and **zero or more nodes frames**. An edges
  frame is required; a lone nodes frame is a table, not a graph.
- Every frame may declare its role in `frame.meta.type`. When no frame declares one, the
  role is read from field shape — see [Frame role resolution](#frame-role-resolution).
- A **mark** — a node or an edge — is one `number` field. Non-numeric fields are never
  marks.
- A mark's **id** is `field.name`. Ids should be meaningful, because `field.name` is what a
  `byName` override, the override picker and the legend address. See
  [Identity](#identity).
- A mark's **value** is its field's values reduced by the consumer's chosen reducer. On a
  single-row frame every reducer agrees.
- A frame may carry one leading `time` or `string` field, the **row dimension**. Its
  presence distinguishes the ranged form from the instant one; it is never a mark.
- Field **labels** carry topology (an edge's endpoints) and free-form attributes.
- Everything a consumer draws beyond position and weight comes from `field.config`, which
  is to say from standard Grafana field configuration and overrides.

### Invalid cases

- A frame with no `number` field is not a graph frame.
- An edge whose endpoints cannot be resolved — no endpoint labels, and no separator in its
  name — is not an edge. Consumers should skip it rather than reject the frame.
- Two nodes should not share an id. A node id is the key edges resolve against, so a
  repeated node is one node; consumers should take the first.
- Two edges **may** share an id, and two edges may share a pair of endpoints, but not both:
  see [Parallel edges require labels](#parallel-edges-require-labels).
- A mark's field should have the same length as its frame, as everywhere in the data plane.

## Graph Edges Wide Format (`graph-edges-wide`)

Version: 0.1

One field per edge. The frame grows _wider_ as edges are added.

**Example:** three edges over three nodes, instant.

| **Type: Number**<br>**Name: gw-api**<br>**Labels: {"source": "gateway", "target": "api"}** | **Type: Number**<br>**Name: api-db**<br>**Labels: {"source": "api", "target": "db"}** | **Type: Number**<br>**Name: gw-db**<br>**Labels: {"source": "gateway", "target": "db"}** |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1200                                                                                       | 800                                                                                   | 40                                                                                       |

It should have the following properties:

- One `number` field per edge.
- `field.name` is the **edge id**.
- `field.labels[source]` and `field.labels[target]` are the ids of the nodes the edge
  joins. The two keys default to `source` and `target`; a producer may declare others in
  [`meta.custom.graph`](#frame-meta).
- Where labels are absent, the endpoints may be split out of `field.name` — see
  [The separator](#the-separator).
- The field's reduced value is the edge **weight**, which is the ribbon size for flow
  visualisations and the tooltip value everywhere.
- The frame has no rows, one row, or — with a row dimension — many.

Optional field configuration, all of it standard:

| `field.config`                                   | Is the edge's                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `displayName`                                    | Label                                                              |
| `color`                                          | Colour, in any of the eight standard modes                         |
| `unit` / `decimals` / `mappings` / `min` / `max` | Value formatting                                                   |
| `thresholds`                                     | Value formatting, and colour when `color.mode` is threshold-driven |
| `links`                                          | Data links                                                         |
| `custom.hideFrom`                                | Visibility, per surface (`viz` / `legend` / `tooltip`)             |
| `custom.lineWidth`                               | Stroke width                                                       |
| `custom.lineType`                                | Stroke pattern — `solid`, `dashed` or `dotted`                     |
| `custom.curveness`                               | Curvature, 0–1                                                     |

The `custom.*` keys are declared by the consuming panel, so a wide edges frame drawn by a
panel that does not declare them keeps everything above them and ignores the rest.

Remainder data:

- Any second `time` or `string` field past the row dimension.
- Numeric fields whose endpoints do not resolve.
- Frames with a different or absent role.

### The separator

An edge's endpoints may be encoded in its name, for producers that cannot emit labels — a
CSV header, a hand-written fixture, a `legendFormat`.

**The separator is exactly the three ASCII characters `-->`.** Not `->`, not `→`, not `=>`.
`a-->b` is the edge from `a` to `b`.

- **Labels win.** A field carrying both endpoint labels and a separator in its name resolves
  from the labels.
- **First separator wins.** `a-->b-->c` is the edge from `a` to `b-->c`.
- A node id that itself contains `-->` is therefore not representable in a name. Put the
  endpoints in labels.

Exactly one separator form is accepted because `->` is a substring of `-->`: a reader
accepting both has to match longest-first, and a shortest-first scan silently mis-splits the
ordinary `my-svc-->other-svc` into `my-svc-` and `other-svc`.

```csv
a-->b,b-->c
420,380
```

### Parallel edges require labels

Two edges joining the same pair of nodes must be two fields with **distinct names** and
their endpoints in **labels**:

| **Type: Number**<br>**Name: e1**<br>**Labels: {"source": "a", "target": "b"}** | **Type: Number**<br>**Name: e2**<br>**Labels: {"source": "a", "target": "b"}** |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 10                                                                             | 20                                                                             |

The name-split form cannot express this: both edges would be named `a-->b`, and while a
frame may legally hold two identically named fields, only their _display_ names are
disambiguated (`a-->b 1`, `a-->b 2`) and the ordinal is positional, so inserting an edge
retargets every override after it.

## Graph Nodes Wide Format (`graph-nodes-wide`)

Version: 0.1

One field per node. Optional: when no nodes frame is present, the node set is the union of
the edges' endpoints.

**Example:** three nodes, instant.

| **Type: Number**<br>**Name: gateway**<br>**Labels: {"zone": "us-east-1"}** | **Type: Number**<br>**Name: api**<br>**Labels: nil** | **Type: Number**<br>**Name: db**<br>**Labels: nil** |
| -------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| 12                                                                         | 8                                                    | 3                                                   |

It should have the following properties:

- One `number` field per node.
- `field.name` is the **node id**, and is what an edge's `source` and `target` resolve
  against.
- The field's reduced value is the node's main stat.
- A node that no edge refers to is still a node; it is drawn unconnected.

Optional field configuration:

| `field.config`                                   | Is the node's                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `displayName`                                    | Title                                                                    |
| `color`                                          | Colour, in any of the eight standard modes                               |
| `unit` / `decimals` / `mappings` / `min` / `max` | Stat formatting                                                          |
| `thresholds`                                     | Stat formatting, and colour when `color.mode` is threshold-driven        |
| `links`                                          | Data links                                                               |
| `custom.hideFrom`                                | Visibility, per surface                                                  |
| `custom.subtitle`                                | Second line                                                              |
| `custom.nodeRadius`                              | Radius in pixels                                                         |
| `custom.icon`                                    | Grafana icon name, drawn in place of the stat                            |
| `custom.fixedX` / `custom.fixedY`                | Pinned position. All-or-nothing: honoured only when every node pins both |

`field.labels` are free-form node attributes, available to tooltips and to a consumer that
wants to group or filter by them.

Remainder data:

- Any second `time` or `string` field past the row dimension.
- Numeric fields naming nodes no edge refers to, for a consumer that derives its node set
  from the edges.
- Frames with a different or absent role.

### The two stats

A node has two stat slots, filled by two reducers over the mark's own field: the first is
the main stat, the second the secondary. On an **instant** frame both reducers see one value
and therefore agree, so a genuine second measurement needs a second carrier — a label, or a
second numeric field excluded from the mark set. Two distinct stats are expressible only
where there is a row dimension to reduce differently.

Reducing "all values" is not part of this kind: it would make one mark per row, and a mark
is a field.

## Graph Edges Multi Format (`graph-edges-multi`)

Version: 0.1

One frame per edge — the shape a labelled datasource returns from
`sum by (source, target) (…)` with no reshaping at all. It stands to
`graph-edges-wide` as `timeseries-multi` stands to `timeseries-wide`: the same contract
spread across _multiple_ frames, one value field each.

**Example:** two edges, ranged.

Frame 0:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: a-->b**<br>**Labels: {"source": "a", "target": "b"}** |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-06 5:00                                     | 60                                                                                |
| 2026-08-06 5:01                                     | 55                                                                                |

Frame 1:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: a-->c**<br>**Labels: {"source": "a", "target": "c"}** |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-06 5:00                                     | 40                                                                                |
| 2026-08-06 5:01                                     | 45                                                                                |

It should have the following properties:

- One value field per frame, carrying the endpoint labels.
- Timestamps need not align across frames, which is the reason to use this format over
  `graph-edges-wide`.
- Every property of [`graph-edges-wide`](#graph-edges-wide-format-graph-edges-wide) applies
  per field.

**Name the value fields.** A datasource that leaves every value field called `Value`
produces N marks with one id: `byName: 'Value'` then matches every edge at once and the
override picker lists `Value` once per frame. A `legendFormat` — or any producer-side
naming — fixes this at the source; a consumer cannot, because it cannot create a field for
an override to land on.

Remainder data:

- Value fields past the first in a frame.
- Additional frames with a different or absent role.

## Frame role resolution

In precedence order:

| Signal                          | Survives                                           |
| ------------------------------- | -------------------------------------------------- |
| 1. `frame.meta.type`            | Only producers that can set frame meta             |
| 2. **Field shape**              | Everything — CSV, SQL expressions, transformations |
| 3. A consumer-side frame picker | Always; the manual override of last resort         |

`meta.type` is authoritative in **both** directions: a frame that declares itself as nodes
is never read as edges, however its fields are named. Field shape is consulted only for
frames that declare nothing, in this order:

1. A frame whose numeric fields carry both endpoint label keys is an **edges** frame.
2. Otherwise a frame whose numeric field names split on `-->` is an **edges** frame.
3. Otherwise, in a response that already has an edges frame, a remaining frame whose numeric
   fields **name a known endpoint** is a **nodes** frame. The endpoint test is what stops an
   unrelated second query from adding disconnected nodes.
4. Without an edges frame there is no graph.

### A role is one-to-many

A role maps to a **list** of frames, not to one. Every frame that claims a role contributes
its marks — which is what makes [Multi](#graph-edges-multi-format-graph-edges-multi)
readable, and is the only place two edges frames from two queries can be unioned.

Two rules keep the plural reading well defined:

- **Declared wins as a filter.** If any frame declares `graph-edges-wide`, only declared
  frames are collected and the shape test is not consulted; likewise for
  `graph-nodes-wide`. A frame that says what it is is never mixed with frames that were
  guessed at.
- **The nodes search excludes every edges candidate**, collected or not. Where two nodes
  frames declare the same node, the first wins.

The endpoint set the nodes search runs against is the union over every collected edges
frame.

## Frame meta

Field shape is enough to _render_. Frame meta is what makes the kind **discoverable**, and
a producer emitting this kind should set all of it:

| Meta key                          | Value                                   | What it buys                                                               |
| --------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `meta.type`                       | `graph-nodes-wide` / `graph-edges-wide` | Unambiguous role resolution, and visualization suggestions                 |
| `meta.typeVersion`                | `[0, 1]`                                | The contract's versioning rule for a kind that has not stabilised          |
| `meta.preferredVisualisationType` | `nodeGraph`                             | Routing in Explore                                                         |
| `meta.custom.graph`               | `{ sourceKey?, targetKey? }`            | Declares non-default endpoint label keys, e.g. Tempo's `client` / `server` |

The proposed additions to `@grafana/data`, **not yet present in core Grafana**:

```typescript
// packages/grafana-data/src/types/dataFrameTypes.ts
export enum DataFrameType {
  // …existing twelve members…

  /** One field per node; `field.name` is the node id. */
  GraphNodesWide = 'graph-nodes-wide',
  /** One field per edge; endpoints in `field.labels`. */
  GraphEdgesWide = 'graph-edges-wide',
  /** One row per node. */
  GraphNodesLong = 'graph-nodes-long',
  /** One row per edge. */
  GraphEdgesLong = 'graph-edges-long',
}

/** The shape of `frame.meta.custom.graph` for either graph kind. Optional. */
export interface GraphFrameMeta {
  /** Label key holding an edge's source node id. Default `'source'`. */
  sourceKey?: string;
  /** Label key holding an edge's target node id. Default `'target'`. */
  targetKey?: string;
}
```

Until those members exist, writing one needs a cast —
`meta: { type: 'graph-edges-wide' as DataFrameType }`. Runtime is unaffected: `meta.type` is
a plain assignment and every consumer test is a string comparison.

**Meta does not survive reshaping.** No core transformation can set `meta.type`, and
`rowsToFields` builds its output frame from scratch. Field shape is therefore the
load-bearing signal on every reshaped path, and meta is what a producer emitting the kind
natively should add on top.

## Identity

`field.name` is the mark's id, and the only stable handle on it.

**Display names are not ids.** `getFieldDisplayName` returns `field.name` plus the label
set, and what it returns changes with the rest of the response: a node field `a` with
`labels: {title: 'Gateway'}` displays as `a Gateway` alone and as `a {title="Gateway"}` once
an edges frame joins the response.

| Frame content                                          | Display name                  |
| ------------------------------------------------------ | ----------------------------- |
| `e1`, labels `{source: 'a', target: 'b'}`              | `e1 {source="a", target="b"}` |
| `a`, labels `{title: 'Gateway'}` — nodes frame alone   | `a Gateway`                   |
| `a`, labels `{title: 'Gateway'}` — with an edges frame | `a {title="Gateway"}`         |
| `Value`, labels `{source: 'a', target: 'b'}`           | `{source="a", target="b"}`    |
| `a-->b`, no labels                                     | `a-->b`                       |
| `a-->b` twice in one frame                             | `a-->b 1` and `a-->b 2`       |

Two consequences for a producer:

- **Give every mark a meaningful name.** A field named literally `Value` contributes
  nothing to its own display name and makes `byName: 'Value'` match every mark at once.
- **Anchor `byRegexp` patterns tolerantly.** `byName` matches the raw name _or_ the display
  name, but `byRegexp` tests the display name only, so `/^e1$/` fails on a labelled field
  and `/^e1 /` matches.

A consumer must not mint ids for marks that collide. A synthetic id is not an override
target, is not what the override picker lists, and is not what a `byName` matcher compares
against — so it would look addressable while being unaddressable.

## Converting between graph formats

| Src                 | Dst                 | Modifies data | Notes                                                                                                                                   |
| ------------------- | ------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `graph-edges-long`  | `graph-edges-wide`  | **No**        | One row becomes one field. Reserved columns become field config; unreserved columns become labels. See [graph-long.md](./graph-long.md) |
| `graph-nodes-long`  | `graph-nodes-wide`  | **No**        | As above                                                                                                                                |
| `graph-edges-multi` | `graph-edges-wide`  | Yes\*         | Needs a shared row grid: the frames are joined on their time field, and gaps become nulls                                               |
| `graph-edges-wide`  | `graph-edges-multi` | **No**        | Split one frame into one frame per field                                                                                                |
| `graph-*-wide`      | `graph-*-long`      | Yes           | Lossy. Per-mark `config` has no column to go to, so colour, unit, links, thresholds and style are dropped                               |

\* Only where the timestamps can be aligned. Where they cannot, `graph-edges-multi` is the
only format that fits, which is the reason it exists.

Core's **Rows to fields** transformation performs the long→wide pivot for anything
table-shaped, with no options: it takes the first `string` field as the field name, the
first `number` field as the value, maps columns named `color` / `unit` / `min` / `max` /
`decimals` onto real field config, and turns every other column into a label. It cannot
write `custom.*` or `links` — those need a producer or a purpose-built transformation.

## Notes

- **This is a `numeric-wide` frame with extra promises.** Any consumer of `numeric-wide` —
  a bar chart, a stat panel, a table — renders a wide graph frame today, one mark per
  field, with per-mark colour, units, links and visibility working. That is the whole
  argument for the format: a mark that is a field is addressable by machinery Grafana
  already has.
- **`field.state.range` is clean.** In the row format the by-value colour domain spans every
  numeric column at once — stats, radii and coordinates together. Here it spans mark values
  only.
- **Density is the cost.** The frame grows as |E|, so a fully connected 30-node graph is 870
  fields. The pipeline handles it; the override picker, which lists two entries per field,
  is the surface that degrades first. Past a few hundred marks, prefer `byRegexp`.

## References

- Grafana data plane contract: https://grafana.com/developers/dataplane/
- Contract spec, including the `typeVersion` rules:
  https://grafana.com/developers/dataplane/contract-spec
- Numeric kind, which these formats specialise:
  https://grafana.com/developers/dataplane/numeric
- The row formats: [graph-long.md](./graph-long.md)
- The rejected matrix format: [graph-matrix.md](./graph-matrix.md)
- `DataFrameType`:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/dataFrameTypes.ts
- Rows to fields:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields
- Field overrides:
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- How this plugin reads the kind: [node-graph.md](./node-graph.md)
- Why the kind is shaped this way, with the measurements behind every rule:
  [../src/modules/relations/node-wide-history.md](../src/modules/relations/node-wide-history.md)
