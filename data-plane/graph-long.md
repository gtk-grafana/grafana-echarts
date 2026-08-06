# Graph data frame kind, long

A **graph** is a set of **nodes** and the **edges** that join them. A response of this kind
carries an **edges** frame and, optionally, a **nodes** frame.

In the **long** formats one mark is one **row**: one node is one row, one edge is one row.
Identity, topology, stats and appearance are all columns, addressed by **reserved field
names**. The frame grows _longer_ as marks are added, and its field count is fixed.

These are the formats every graph-native datasource emits today — Tempo, AWS X-Ray, Grafana
TestData — and they are published on the core Node graph panel's
[Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).

> **Proposed kind.** `DataFrameType` in `@grafana/data` 13.1.1 has twelve members and none
> is graph-related; the format below is real and stable but unnamed. Per the contract's
> versioning rules a newly named kind starts at `typeVersion` `0.1`. See
> [Frame meta](#frame-meta).

Structurally this is a `numeric-long` frame pair with reserved column names: `source` and
`target` are dimension columns, `mainstat` is the value column. The field-based
counterpart, in which a mark is a field rather than a row, is
[graph-wide.md](./graph-wide.md).

## Common properties

- A response has an **edges** frame and, optionally, a **nodes** frame. An edges frame is
  required; a lone nodes frame is a table, not a graph.
- Every mark is a **row**, and the frames are square: `field.values[row]` lines up across
  all fields of a frame.
- Field names are **reserved and lowercase**. A column not named below is not part of the
  kind, with two prefix exceptions: `arc__*` and `detail__*`.
- The node set is the union of the nodes frame's `id` column and every endpoint the edges
  frame refers to. An edges-only response is complete.
- Because a mark is a row and Grafana's override matcher addresses fields, **nothing here
  is configurable per node or per edge.** Appearance travels in the data, in the `color`,
  `thickness` and `strokedasharray` columns.

### Invalid cases

- An edge row with no `source` or no `target` is not an edge.
- Two node rows should not share an `id`.
- `arc__*` values for one node should sum to 1.
- `fixedx` and `fixedy` are all-or-nothing: if any node supplies them, every node should.
- `color` and `arc__*` should not both be set on the same nodes frame — they are two
  spellings of the same thing.

## Graph Edges Long Format (`graph-edges-long`)

Version: 0.1

One row per edge.

**Example:**

| **Type: String**<br>**Name: id**<br>**Labels: nil** | **Type: String**<br>**Name: source**<br>**Labels: nil** | **Type: String**<br>**Name: target**<br>**Labels: nil** | **Type: Number**<br>**Name: mainstat**<br>**Labels: nil** |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| gw-api                                              | gateway                                                 | api                                                     | 1200                                                      |
| api-db                                              | api                                                     | db                                                      | 800                                                       |
| gw-db                                               | gateway                                                 | db                                                      | 40                                                        |

Required fields:

| Field name | Type   | Is                                   |
| ---------- | ------ | ------------------------------------ |
| `id`       | string | The edge's unique identifier         |
| `source`   | string | The `id` of the node the edge leaves |
| `target`   | string | The `id` of the node the edge enters |

Optional fields:

| Field name        | Type          | Is                                                                                                   |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `mainstat`        | string/number | The first stat shown on hover. A number is formatted with the column's unit; a string is shown as-is |
| `secondarystat`   | string/number | The second stat, shown under the first                                                               |
| `detail__*`       | string/number | One entry in the edge's detail surface. Label it with the column's `config.displayName`              |
| `thickness`       | number        | Stroke width in pixels. Default `1`                                                                  |
| `color`           | string        | Stroke colour, as an HTML colour string. Default `#999`                                              |
| `strokedasharray` | string        | An SVG `stroke-dasharray`. Unset draws a solid line                                                  |
| `highlighted`     | boolean       | **Deprecated** since Grafana 10.5 — use `color`                                                      |

Remainder data:

- Any column not named above and not prefixed `detail__`.
- Time fields.
- Frames with a different or absent role.

## Graph Nodes Long Format (`graph-nodes-long`)

Version: 0.1

One row per node. Optional overall: supply it only when nodes need metadata beyond what the
edges imply.

**Example:**

| **Type: String**<br>**Name: id**<br>**Labels: nil** | **Type: String**<br>**Name: title**<br>**Labels: nil** | **Type: Number**<br>**Name: mainstat**<br>**Labels: nil** |
| --------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| gateway                                             | Gateway                                                | 12                                                        |
| api                                                 | API                                                    | 8                                                         |
| db                                                  | Database                                               | 3                                                         |

Required fields:

| Field name | Type   | Is                                                                      |
| ---------- | ------ | ----------------------------------------------------------------------- |
| `id`       | string | The node's unique identifier, referenced by an edge's `source`/`target` |

Optional fields:

| Field name       | Type          | Is                                                                                                                                         |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`          | string        | The name shown under the node                                                                                                              |
| `subtitle`       | string        | A second line under the title                                                                                                              |
| `mainstat`       | string/number | The first stat shown inside the node                                                                                                       |
| `secondarystat`  | string/number | The second stat, under the first                                                                                                           |
| `arc__*`         | number        | One section of the ring drawn around the node. Sections should sum to 1; each takes its colour from the column's `config.color.fixedColor` |
| `detail__*`      | string/number | One entry in the node's detail surface. Label it with the column's `config.displayName`                                                    |
| `color`          | string/number | A single colour instead of `arc__*`. A string is an HTML colour; a number is read through the column's `config.color.mode`                 |
| `icon`           | string        | The name of a built-in Grafana icon, drawn in place of the stats                                                                           |
| `noderadius`     | number        | The node's radius in pixels                                                                                                                |
| `highlighted`    | boolean       | Whether the node is highlighted. Default `false`                                                                                           |
| `fixedx`         | number        | A pinned x coordinate. All-or-nothing across nodes                                                                                         |
| `fixedy`         | number        | A pinned y coordinate. All-or-nothing across nodes                                                                                         |
| `isinstrumented` | boolean       | Whether the node is instrumented                                                                                                           |

Remainder data:

- Any column not named above and not prefixed `arc__` or `detail__`.
- Time fields.
- Frames with a different or absent role.

## Frame role resolution

The kind has no `meta.type` today, so consumers identify it by field shape. Grafana's own
selection, in `getNodeGraphDataFrames`, accepts a frame when **any** of the following hold:

- `frame.meta.preferredVisualisationType === 'nodeGraph'`, or
- the frame's `name` or `refId` is `nodes` or `edges`, or
- the frame contains a field named `id`.

Role is then decided by one test: **a frame with a `source` field is the edges frame**, and
anything else is a nodes frame.

That third acceptance test is deliberately broad — any table with an `id` column qualifies —
and Grafana gets away with it because the check runs only after a user has chosen the node
graph panel. A consumer that wants to **auto-detect** graph data should require an edges
frame to carry `source` **and** `target`, which is the only shape signal specific to this
kind.

Field names are matched lowercased.

## Frame meta

A producer should set:

| Meta key                          | Value                                   | What it buys                                            |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `meta.type`                       | `graph-nodes-long` / `graph-edges-long` | Unambiguous role resolution, and suggestions            |
| `meta.typeVersion`                | `[0, 1]`                                | The contract's versioning rule for an unstabilised kind |
| `meta.preferredVisualisationType` | `nodeGraph`                             | Routing in Explore. The only signal in use today        |

The proposed additions to `@grafana/data`, **not yet present in core Grafana**:

```typescript
// packages/grafana-data/src/types/dataFrameTypes.ts
export enum DataFrameType {
  // …existing twelve members…

  /** One row per node, identified by the `id` column. */
  GraphNodesLong = 'graph-nodes-long',
  /** One row per edge, identified by the `id` column, joining `source` to `target`. */
  GraphEdgesLong = 'graph-edges-long',
}
```

Until those members exist, writing one needs a cast —
`meta: { type: 'graph-edges-long' as DataFrameType }`. Naming the kind is worth doing even
though the format is unchanged by it: it lets a producer migrate to
[`graph-*-wide`](./graph-wide.md) while old dashboards still receive rows, with both ends
able to tell which they got from one string comparison rather than a field-shape walk.

The names are also already in use informally: `graph-*-long` is how this format is referred
to wherever it needs distinguishing from the wide one.

## Converting between graph formats

| Src                | Dst                | Modifies data | Notes                                                                                                      |
| ------------------ | ------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `graph-edges-long` | `graph-edges-wide` | **No**        | One row becomes one field: `id` → `field.name`, `source`/`target` → labels, `mainstat` → the field's value |
| `graph-nodes-long` | `graph-nodes-wide` | **No**        | As above, with `title` → `config.displayName`                                                              |
| `graph-*-wide`     | `graph-*-long`     | Yes           | Lossy — per-mark field config has no column to go to                                                       |

Column by column, going wide:

| Long column       | Wide equivalent                    | Note                                                                                                     |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`              | `field.name`                       | Becomes an override target, which the column never was                                                   |
| `source`/`target` | `field.labels.source` / `.target`  | Or a `-->` split of the name                                                                             |
| `mainstat`        | The field's values                 | Numeric only: a field has one type                                                                       |
| `secondarystat`   | A second reducer over those values | Expressible only where there is a row dimension; otherwise a label                                       |
| `title`           | `config.displayName`               |                                                                                                          |
| `subtitle`        | `config.custom.subtitle`           |                                                                                                          |
| `color` (string)  | `config.color.fixedColor`          |                                                                                                          |
| `color` (number)  | `config.color.mode` + the values   | An ordinary by-value colour scheme                                                                       |
| `thickness`       | `config.custom.lineWidth`          |                                                                                                          |
| `strokedasharray` | `config.custom.lineType`           | Approximated to `solid` / `dashed` / `dotted`                                                            |
| `noderadius`      | `config.custom.nodeRadius`         |                                                                                                          |
| `icon`            | `config.custom.icon`               |                                                                                                          |
| `fixedx`/`fixedy` | `config.custom.fixedX` / `.fixedY` | Same all-or-nothing rule                                                                                 |
| `detail__*`       | `field.labels.*`                   |                                                                                                          |
| `arc__*`          | `config.thresholds` steps          | An approximation: a threshold set is an ordered partition of the value domain, not arbitrary proportions |
| `highlighted`     | —                                  | Dropped; deprecated for edges since Grafana 10.5                                                         |
| `isinstrumented`  | —                                  | Dropped; a core-panel styling hint with no general meaning                                               |

Core's **Rows to fields** transformation performs most of this pivot with no options, but
it cannot write into `custom.*` or `links`; those columns degrade to labels. See
[graph-wide.md](./graph-wide.md#converting-between-graph-formats).

## Notes

- **This is a `numeric-long` frame pair with reserved column names.** Nothing about the
  layout is graph-specific; the reserved names are.
- **A mark is a row, so no mark is individually configurable.** Grafana's override matcher
  is `(field, frame, allFrames) => boolean`, so the override picker on a graph panel lists
  `id`, `source`, `target`, `mainstat` — four entries, however many nodes and edges the
  response holds. Colour, unit, decimals, data links and visibility are all-marks-or-none.
  This is the constraint [graph-wide.md](./graph-wide.md) exists to remove.
- **`field.state.range` spans every numeric column.** A nodes frame with `mainstat` 8–12
  and `noderadius` 40–60 gives every field the domain `{min: 8, max: 60}`, so a by-value
  colour scheme over `mainstat` is scaled by the radii. Inherent to the row shape.
- **`mainstat` may be a string,** so a consumer that needs a number for geometry needs a
  fallback chain.

## References

- Node graph panel Data API — the published contract:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- `NodeGraphDataFrameFieldNames`, the reserved-name enum:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/utils/nodeGraph.ts
- Frame selection (`getNodeGraphDataFrames`) and role resolution (`applyOptionsToFrames`):
  https://github.com/grafana/grafana/blob/main/public/app/plugins/panel/nodeGraph/utils.ts
- Grafana data plane contract: https://grafana.com/developers/dataplane/
- Numeric kind, which this specialises: https://grafana.com/developers/dataplane/numeric
- The field-based counterpart: [graph-wide.md](./graph-wide.md)
- How the relations family draws a graph: [echarts-coverage.md](./echarts-coverage.md)
