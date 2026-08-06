# Graph data frame kind, multi

A **graph** is a set of **nodes** and the **edges** that join them. A response of this kind
carries an **edges** frame and, optionally, a **nodes** frame.

In the **multi** formats one mark is one **frame**: one edge is one frame, one node is one
frame. Each frame holds a single value field, and everything the
[wide formats](./graph-wide.md) say about that field — its name is the mark's id, its labels
carry the topology, its config carries the styling — applies unchanged. The response grows
by _multiple_ frames rather than by columns.

This is the shape a labelled datasource returns with no reshaping at all:
`sum by (source, target) (rate(traces_service_graph_request_total[$__range]))` in
`Format: Time series` is one frame per edge, endpoints already in labels.

Multi stands to wide as `timeseries-multi` stands to `timeseries-wide`, and exists for the
same reason: **the frames need not share a row grid.** Two edges sampled at different
timestamps cannot be one wide frame without a join, and a join invents values that were
never measured.

> **Proposed kind.** `DataFrameType` in `@grafana/data` 13.1.1 has twelve members and none
> is graph-related. Per the contract's versioning rules these formats are at `typeVersion`
> `0.1`. See [Frame meta](#frame-meta).

Related kinds:

- [graph-wide.md](./graph-wide.md) — one frame, one field per mark. The base contract; every
  per-field rule below is defined there.
- [graph-long.md](./graph-long.md) — one frame, one row per mark.
- [graph-matrix.md](./graph-matrix.md) — an adjacency-matrix edges format, proposed and
  rejected.

## Common properties

- Each frame carries **one** value field, which is one mark.
- Each frame may carry a leading `time` or `string` field, its own row dimension. Row grids
  need not align across frames — that is the point of the format.
- Every property of the corresponding wide format applies per value field. Multi changes
  the frame count, not the contract.
- A response may mix formats: a single `graph-nodes-wide` frame alongside N
  `graph-edges-multi` frames is well defined, because
  [a role is one-to-many](./graph-wide.md#a-role-is-one-to-many).

### Invalid cases

- A frame with more than one numeric field is not a multi frame. The second field is
  remainder data, not a second mark.
- Value fields **must be named**. See [Identity](#identity-is-the-hazard) — this is the one
  way a multi response is easier to produce and harder to use than a wide one.

## Graph Edges Multi Format (`graph-edges-multi`)

Version: 0.1

One frame per edge.

**Example:** two edges, ranged, on a shared clock — though nothing requires one.

Frame 0:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: a-->b**<br>**Labels: {"source": "a", "target": "b"}** |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-06 5:00                                     | 60                                                                                |
| 2026-08-06 5:01                                     | 55                                                                                |

Frame 1:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: a-->c**<br>**Labels: {"source": "a", "target": "c"}** |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| 2026-08-06 5:00                                     | 40                                                                                |
| 2026-08-06 5:02                                     | 45                                                                                |

It should have the following properties:

- One `number` field per frame, which is the edge.
- `field.name` is the edge id.
- `field.labels[source]` and `field.labels[target]` are the ids of the nodes it joins,
  under the keys the [wide format](./graph-wide.md#graph-edges-wide-format-graph-edges-wide)
  defines. Endpoints may also be split out of the name using the same
  [separator](./graph-wide.md#the-separator) rules.
- The field's reduced value is the edge weight.
- All the same optional `field.config` — `displayName`, `color`, `unit`, `decimals`,
  `mappings`, `thresholds`, `links`, `custom.hideFrom`, `custom.lineWidth`,
  `custom.lineType`, `custom.curveness`.

Because each edge has its own frame, two edges over the same pair of nodes are naturally
distinct: [parallel edges](./graph-wide.md#parallel-edges-require-labels) need no special
handling here beyond distinct field names.

Remainder data:

- Value fields past the first in a frame.
- Any second `time` or `string` field past the row dimension.
- Frames with a different or absent role.

## Graph Nodes Multi Format (`graph-nodes-multi`)

Version: 0.1

One frame per node. Optional, exactly as the nodes frame is in every graph format: the node
set is derivable from the edges' endpoints.

**Example:** two nodes.

Frame 0:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: gateway**<br>**Labels: {"zone": "us-east-1"}** |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-08-06 5:00                                     | 12                                                                         |

Frame 1:

| **Type: Time**<br>**Name: Time**<br>**Labels: nil** | **Type: Number**<br>**Name: api**<br>**Labels: nil** |
| --------------------------------------------------- | ---------------------------------------------------- |
| 2026-08-06 5:00                                     | 8                                                    |

It should have the following properties:

- One `number` field per frame, which is the node.
- `field.name` is the node id, and is what an edge's `source` and `target` resolve against.
- All the optional `field.config` of
  [`graph-nodes-wide`](./graph-wide.md#graph-nodes-wide-format-graph-nodes-wide).

**This format needs a declaration or a named field, and usually both.** A nodes frame is
recognised by shape only when its numeric field names an endpoint the edges already refer
to; a one-field frame called `Value` names nothing. Either give the field the node's id, or
set `meta.type`.

Remainder data:

- Value fields past the first in a frame.
- Frames naming nodes no edge refers to, for a consumer that derives its node set from the
  edges.
- Frames with a different or absent role.

## Identity is the hazard

The format's one real cost. A datasource that leaves every value field called `Value`
produces N marks sharing one id:

- `byName: 'Value'` matches **every** mark at once;
- the override picker lists one `Value` entry per frame;
- `getFieldDisplayName` does not rescue it. The frame-name prefix applies only when
  `allFrames.length > 1` **and** consecutive frames carry different `frame.name`. A
  Prometheus range query sets no frame name at all, so there is no prefix — and
  `getUniqueFieldName`'s `1`/`2` suffixes are frame-local, so N one-field frames get none.

The fix belongs at the **producer**: a `legendFormat` of `{{client}}-->{{server}}`, an
alias, or a `displayNameFromDS`. A consumer cannot fix it, because an override needs a real
field to land on and a consumer cannot create one; the most it can do is mint a private key
so per-mark formatting and links still resolve, which is not an override target and must
never be presented as an id.

A pivot to [`graph-edges-wide`](./graph-wide.md) run **before** field overrides are applied
fixes it too, by turning each mark's id into a genuine `field.name`. That is only available
where such a pivot can be inserted upstream of the override pass.

## Frame meta

| Meta key                          | Value                                     | What it buys                                                      |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `meta.type`                       | `graph-nodes-multi` / `graph-edges-multi` | Role resolution, and the only reliable signal for a nodes frame   |
| `meta.typeVersion`                | `[0, 1]`                                  | The contract's versioning rule for a kind that has not stabilised |
| `meta.preferredVisualisationType` | `nodeGraph`                               | Routing in Explore                                                |
| `meta.custom.graph`               | `{ sourceKey?, targetKey? }`              | Declares non-default endpoint label keys                          |

Every frame in the response should declare the same type; there is no "first frame carries
the declaration" rule.

The proposed additions to `@grafana/data`, **not yet present in core Grafana**:

```typescript
// packages/grafana-data/src/types/dataFrameTypes.ts
export enum DataFrameType {
  // …existing twelve members…

  /** One frame per node; the single value field's name is the node id. */
  GraphNodesMulti = 'graph-nodes-multi',
  /** One frame per edge; endpoints in the single value field's labels. */
  GraphEdgesMulti = 'graph-edges-multi',
}
```

A consumer should read `meta.type` as a **filter**: when any frame declares
`graph-edges-multi`, only declared frames are collected and field shape is not consulted.
See [Frame role resolution](./graph-wide.md#frame-role-resolution), which multi shares
unchanged.

## Converting between graph formats

| Src                 | Dst                 | Modifies data | Notes                                                                                                               |
| ------------------- | ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `graph-edges-multi` | `graph-edges-wide`  | Yes\*         | Join the frames on their row dimension. Rows one frame did not sample become `null`                                 |
| `graph-edges-wide`  | `graph-edges-multi` | **No**        | Split one frame into one frame per value field, carrying the row dimension into each                                |
| `graph-edges-multi` | `graph-edges-long`  | Yes           | Lossy — per-mark `config` has no column to go to                                                                    |
| `graph-edges-long`  | `graph-edges-multi` | **No**        | One row becomes one frame. `rowsToFields` produces the wide form instead; this direction has no core transformation |

\* And only where the row dimensions can be aligned. Where they cannot, multi is the only
format that fits, which is the reason it exists. A join that fabricates alignment is worse
than the extra frames.

Nodes convert the same way, with `graph-nodes-*` throughout.

## Notes

- **This is a `numeric-multi` / `timeseries-multi` frame set with extra promises.** Any
  consumer of those kinds renders a multi graph response today, one series per frame.
- **Multi is the cheapest format to produce and the most expensive to address.** No
  transformation, no join, no `legendFormat` is needed to get the data out; every one of
  those is needed to make the marks individually configurable.
- **The frame count is |E|, not |E| + 1.** Frame overhead is per-mark here, where wide pays
  per-field overhead in one frame. The pipeline cost is comparable; the difference is that
  every frame carries its own row dimension, so a ranged response repeats the timestamps
  once per edge.

## References

- Grafana data plane contract: https://grafana.com/developers/dataplane/
- Contract spec, including the `typeVersion` rules:
  https://grafana.com/developers/dataplane/contract-spec
- Time series multi, the format this mirrors:
  https://grafana.com/developers/dataplane/timeseries
- The base contract: [graph-wide.md](./graph-wide.md)
- The row formats: [graph-long.md](./graph-long.md)
- `DataFrameType`:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/dataFrameTypes.ts
- Where a multi response comes from, per datasource:
  [../docs/relations-data-sources.md](../docs/relations-data-sources.md)
- Why the identity hazard is unfixable in a consumer:
  [../src/modules/relations/node-wide-history.md](../src/modules/relations/node-wide-history.md)
