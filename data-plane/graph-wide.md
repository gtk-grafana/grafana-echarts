# Wide graph data frame kind

A graph contains nodes and edges. An edge joins two nodes. A response of this kind contains an edges frame and can
contain a nodes frame.

A field is one column of data. In the wide formats, each field represents one mark. A mark is a node or an edge.
A row grid is the ordered row sequence of a frame.

The values of a field give the weight of the mark across the rows of the frame. The `name` identifies the mark.
The `labels` contain the topology. Topology identifies the nodes that each edge joins. The `config` contains all other
data about the mark.
This data includes color, unit, decimals, thresholds, mappings, data links, and style.

This kind is the graph equivalent of `numeric-wide`. A graph is a set of named numbers and the pairs of names that
connect.

> Proposed kind. `DataFrameType` in `@grafana/data` 13.1.1 contains twelve members. It does not contain a graph member.
> Thus, this document does not redefine an existing kind. These formats use `typeVersion` `0.1` in accordance with the
> version rules.
> They are defined, but they can change. Refer to [Frame meta](#frame-meta).

The [graph-long.md](./graph-long.md) kind defines the `graph-nodes-long` and `graph-edges-long` row formats. Each
graph-native datasource uses these formats at this time.

The [graph-multi.md](./graph-multi.md) kind uses the same contract as this kind. It uses one frame for each mark when
marks do not share a row grid.

## Common properties

A data frame is a table of fields. A reducer combines the values of a field into one value.
A frame role identifies a frame as nodes or edges.

- A response contains one or more edges frames and zero or more nodes frames. An edges frame is necessary. A nodes frame
  alone is a table.
- Each frame can declare its role in `frame.meta.type`. If no frame declares a role, the field shape gives the role.
  Refer to [Frame role resolution](#frame-role-resolution).
- Each `number` field is one mark. A nonnumeric field is not a mark.
- The mark ID is `field.name`. Give each ID a useful value because overrides, the override picker, and the legend use
  this value. Refer to [Identity](#identity).
- The mark value is the result of the reducer that the consumer selects. All reducers give the same result for a frame
  with one row.
- A frame can contain one leading `time` or `string` field. This field is the row dimension and is not a mark.
- The row dimension identifies a ranged frame. A frame without a row dimension is an instant frame.
- Field labels contain topology and free-form attributes. The topology labels identify the endpoints of an edge.
- The consumer gets all visual data except position and weight from `field.config`. This data uses the standard Grafana
  field configuration and overrides.

### Invalid cases

- A frame without a `number` field is not a graph frame.
- An edge is invalid if the consumer cannot find its endpoints. The consumer must ignore the edge and must not reject
  the frame.
- Two nodes must not have the same ID. Repeated node IDs identify one node, and the consumer must use the first node.
- Two edges can have the same ID. Two edges can have the same endpoints. They cannot have both. Refer
  to [Parallel edges require labels](#parallel-edges-require-labels).
- The length of each mark field must equal the frame length. This requirement applies throughout the data plane.

## Graph Edges Wide Format (`graph-edges-wide`)

Version: 0.1

Each field represents one edge. The frame becomes wider when a producer adds edges.

Example: Three edges across three nodes in an instant frame.

| Type: Number<br>Name: gw-api<br>Labels: {"source": "gateway", "target": "api"} | Type: Number<br>Name: api-db<br>Labels: {"source": "api", "target": "db"} | Type: Number<br>Name: gw-db<br>Labels: {"source": "gateway", "target": "db"} |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1200                                                                           | 800                                                                       | 40                                                                           |

The format has these properties:

- Each edge has one `number` field.
- `field.name` is the edge ID.
- `field.labels[source]` and `field.labels[target]` contain the node IDs that the edge joins.
- The default endpoint keys are `source` and `target`. A producer can declare other keys in [
  `meta.custom.graph`](#frame-meta).
- The consumer also accepts conventional endpoint pairs without a declaration. Refer
  to [Endpoint label keys](#endpoint-label-keys).
- If labels are absent, the consumer can get the endpoints from `field.name`. Refer to [The separator](#the-separator).
- The reduced field value is the edge weight. Flow visualizations use this value for ribbon size. All tooltips show this
  value.
- The frame can have no rows or one row. A frame with a row dimension can have many rows.

All field configuration is optional and uses standard keys:

| `field.config`                                   | Purpose                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `displayName`                                    | The edge label                                                   |
| `color`                                          | The edge color in all modes except palettes                      |
| `unit` / `decimals` / `mappings` / `min` / `max` | The value format                                                 |
| `thresholds`                                     | The value format and the color when `color.mode` uses thresholds |
| `links`                                          | The data links                                                   |
| `custom.hideFrom`                                | The visibility for each surface: `viz`, `legend`, or `tooltip`   |
| `custom.lineWidth`                               | The stroke width                                                 |
| `custom.lineType`                                | The stroke pattern: `solid`, `dashed`, or `dotted`               |
| `custom.curveness`                               | The curvature from 0 through 1                                   |

The consuming panel declares the `custom.*` keys. A panel without these declarations keeps the standard configuration
and ignores the custom configuration.

An edge uses `color` in all modes except the `palette-*` modes. A palette selects a color by sibling position or by a
hash of the field name.
Neither method describes the two nodes that the edge joins. Thus, the consumer treats a palette as no configured edge
color and selects the link color.

The `fixed`, `shades`, and `gradient` modes give a literal color for the mark. The `thresholds` and `continuous-*` modes
select a color from the edge weight.
A node uses all color modes, including palettes.

Remainder data is data that the graph does not use. The consumer treats these fields and frames as remainder data:

- A second `time` or `string` field after the row dimension.
- A numeric field with endpoints that the consumer cannot find.
- A frame with a different role or without a role.

### Endpoint label keys

The contract uses `source` and `target` as its keys. No datasource emits these keys. Grafana service-graph metrics use
`client` and `server`.
Other producers use `src` and `dst`, or `from` and `to`.

A query that conforms to the contract usually contains this rename:

```promql
sum by (source, target) (
  label_replace(label_replace(…, "source", "$1", "client", "(.*)"), "target", "$1", "server", "(.*)")
)
```

The rename is the only purpose of the query operation. The operation also removes `client` and `server` before the panel
receives the response.

A conventional pair is a common pair of endpoint keys. The consumer finds the endpoint keys in this sequence:

1. Use the pair that the frame declares in [`meta.custom.graph`](#frame-meta). This pair supports keys that the consumer
   cannot predict.
2. If step 1 gives no pair, use the first conventional pair in the field.
   Use this order: `source`/`target`, `client`/`server`, `src`/`dst`, and `from`/`to`.
3. If the other steps give no pair, use [the separator](#the-separator) in `field.name`.

The declared pair is authoritative. The canonical pair is `source` and `target`.
A converter changes data from one format to another. It writes the canonical pair and keeps the declaration that
identifies the original pair.
A pivot changes rows into fields.

For example, a pivot can change `client` and `server` labels to `source` and `target`. It leaves
`meta.custom.graph.sourceKey: 'client'` in the frame.
The read operation still succeeds. Step 1 gives no match, and step 2 finds the canonical pair.

The declaration records the dimension name from the datasource. A consumer needs this name when it writes a query.
Examples include an ad hoc filter, a drilldown link, and a generated PromQL selector. A filter for `source="web-api"`
matches nothing if the metric never contained that label.

#### Recovery by value

The first three steps identify the locations of the endpoints. They do not identify the original keys that contain the
endpoint values.
This question occurs when the response contains both the canonical pair and the original pair.

An operand is one input to an operation. `label_replace` copies a value and does not move it.
An operand can keep the original labels when it does not aggregate them:

```promql
sum by (source, target, cluster, namespace) (
  label_replace(label_replace(…, "source", "$1", "cluster", "(.*)"), "target", "$1", "namespace", "(.*)")
)
```

The consumer can compare the endpoint values with the labels for each field. The key that contains the source value is
the source key.
The same rule identifies the target key. This recovery uses the same exact string comparison that created the copy.

Recovery occurs for each edge. A multi-level flow connects nodes across more than one level.
It uses one query that joins operands with `or`.
The operands can relabel values from different original keys. Thus, level-1 edges recover `cluster` and `namespace`.
Level-2 edges recover `namespace` and `workload` from the same frame. One declaration cannot contain these two answers.

The recovery rules prevent an incorrect key from producing a filter that matches nothing:

- The consumer recovers both ends or neither end. One matching end is a coincidence.
- For example, `{source: "api", target: "db", job: "api"}` gives no recovered pair. The canonical pair remains in use.
- If two labels contain the source value, the result is ambiguous. The consumer recovers nothing.
- The consumer does not examine the pair that supplied the endpoints. That pair is already the answer.
- The consumer examines other recognized endpoint keys. For example, `server` can identify the final node in a
  `namespace → service` flow.
- A self-loop is an edge with the same node at both ends. It uses the first two keys that contain the value.
- If a self-loop finds a different number of matching keys, the consumer recovers nothing.

A node does not contain its own pair because `field.name` contains its identity. The node gets its keys from the edges
that connect to it.
This method gives the correct result for a multi-level flow without configuration. A namespace node is the target at
level 1 and the source at level 2.
Both edges identify `namespace`.

### The separator

Some producers cannot emit labels. Examples include a CSV header, a manually written fixture, and a `legendFormat`.
These producers can encode the endpoints in the edge name.

The separator is the three ASCII characters `-->`.
`a-->b` identifies an edge from `a` to `b`.

- If the field contains both endpoint labels and a separator, use the labels.
- If the field has no endpoint labels, use the first separator. Thus, `a-->b-->c` identifies an edge from `a` to
  `b-->c`.
- If the field has labels, the consumer can select the split where both halves occur as label values.
- For example, `a-->b-->c` with `{src_group: "a-->b", dst_group: "c"}` identifies an edge from `a-->b` to `c`.
- Only a split that matches both halves is evidence. One matching half is not evidence because all splits can have a
  matching half.
- A node ID that contains `-->` cannot use the name alone. Put the endpoints in labels, or provide a label for
  comparison.

The edge name is not always `field.name`. A datasource puts a `legendFormat` result in `field.config.displayNameFromDS`.
It does not put this result in the field name. Thus, a long Prometheus series keeps the name `Value`, independent of its
legend.

A converter that changes long series to this contract must also read the separator from the generated legend.
This rule lets `legendFormat: "{{cluster}}-->{{namespace}}"` identify endpoints when the labels do not use a
conventional pair.

```csv
a-->b,b-->c
420,380
```

### Parallel edges require labels

Two edges between the same two nodes must use two fields. The fields must have different names, and their labels must
contain the endpoints.

| Type: Number<br>Name: e1<br>Labels: {"source": "a", "target": "b"} | Type: Number<br>Name: e2<br>Labels: {"source": "a", "target": "b"} |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 10                                                                 | 20                                                                 |

The name-split form cannot represent parallel edges because both fields get the name `a-->b`.
A frame can contain two fields with the same name. Only the shown names distinguish them as `a-->b 1` and `a-->b 2`.
The number is positional. Thus, the insertion of an edge changes the override target for each later edge.

## Graph Nodes Wide Format (`graph-nodes-wide`)

Version: 0.1

Each field represents one node. The nodes frame is optional. If it is absent, the node set is the union of the edge
endpoints.

A consumer that infers nodes must declare them before it processes the response. It declares ordinary fields in a
`graph-nodes-wide` frame.
Without this step, no field configuration can address an inferred node. Refer
to [../docs/relations-derived-nodes.md](../docs/relations-derived-nodes.md).

Example: Three nodes in an instant frame.

| Type: Number<br>Name: gateway<br>Labels: {"zone": "us-east-1"} | Type: Number<br>Name: api<br>Labels: nil | Type: Number<br>Name: db<br>Labels: nil |
| -------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| 12                                                             | 8                                        | 3                                       |

The format has these properties:

- Each node has one `number` field.
- `field.name` is the node ID. The `source` and `target` values of an edge refer to this ID.
- The reduced field value is the main statistic of the node.
- A node remains a node when no edge refers to it. The consumer shows it without a connection.

The field configuration is optional:

| `field.config`                                   | Purpose                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `displayName`                                    | The node title                                                       |
| `color`                                          | The node color in each of the eight standard modes                   |
| `unit` / `decimals` / `mappings` / `min` / `max` | The statistic format                                                 |
| `thresholds`                                     | The statistic format and the color when `color.mode` uses thresholds |
| `links`                                          | The data links                                                       |
| `custom.hideFrom`                                | The visibility for each surface                                      |
| `custom.subtitle`                                | The second line                                                      |
| `custom.nodeRadius`                              | The radius in pixels                                                 |
| `custom.icon`                                    | The Grafana icon name that replaces the statistic                    |
| `custom.fixedX` / `custom.fixedY`                | The fixed position, used only when each node sets both values        |

`field.labels` contains free-form node attributes. Tooltips use these attributes. A consumer can also use them to group
or filter nodes.

The consumer treats these fields and frames as remainder data:

- A second `time` or `string` field after the row dimension.
- A numeric field that names a node without an edge reference, if the consumer derives its node set from edges.
- A frame with a different role or without a role.

### The two statistics

A node has two statistic positions. Two reducers operate on the field of the mark.
The first result is the main statistic, and the second result is the secondary statistic.

In an instant frame, both reducers receive one value and give the same result. A second measurement requires a second
carrier.
The carrier can be a label or a numeric field that is not in the mark set. Only a ranged frame can express two
statistics through different reducers.

Reduction of all values is not part of this kind. That reduction makes one mark for each row, but a mark in this kind is
a field.

## Frame role resolution

The consumer uses these signals in order:

| Signal                            | Availability                              |
| --------------------------------- | ----------------------------------------- |
| 1. `frame.meta.type`              | Only producers that can set frame meta    |
| 2. Field shape                    | CSV, SQL expressions, and transformations |
| 3. A frame picker in the consumer | The manual override of last resort        |

`meta.type` is authoritative in both directions. The consumer never reads a declared nodes frame as edges, independent
of its field names.
The consumer examines field shape only for frames that do not declare a role. An inferred role is a role that field
shape supplies.

The consumer uses this sequence:

1. A frame is an edges frame if its numeric fields contain both endpoint label keys.
2. Otherwise, a frame is an edges frame if its numeric field names split on `-->`.
3. A remaining frame can be a nodes frame after the response contains an edges frame.
4. Its numeric fields must name a known endpoint. This requirement prevents an unrelated second query from adding
   disconnected nodes.
5. Without an edges frame, the response is not a graph.

### One role can have many frames

A role maps to a list of frames. Each frame that claims a role contributes its marks.
This rule supports [graph-multi.md](./graph-multi.md). It also lets two queries contribute two edges frames to one
graph.

Declared roles act as a filter. If a frame declares `graph-edges-wide`, the consumer collects only declared edges
frames.
It does not use the shape test. The same rule applies to `graph-nodes-wide`.
The consumer never mixes a declared frame with a frame that has an inferred role.

The search for nodes excludes all edges candidates, including candidates that the consumer does not collect.
If two nodes frames declare the same node, the consumer uses the first node.

The endpoint set for the nodes search is the union of all collected edges frames.

## Frame meta

Field shape is sufficient for the consumer to show the graph. Frame meta makes the kind discoverable.
A producer that emits this kind natively must set all of these values:

| Meta key                          | Value                                   | Result                                                                                                                                                 |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta.type`                       | `graph-nodes-wide` / `graph-edges-wide` | The role is unambiguous, and Grafana can suggest a visualization.                                                                                      |
| `meta.typeVersion`                | `[0, 1]`                                | The version follows the contract rule for a kind that is not stable.                                                                                   |
| `meta.preferredVisualisationType` | `nodeGraph`                             | Explore can route the frame.                                                                                                                           |
| `meta.custom.graph`               | `{ sourceKey?, targetKey? }`            | The value declares endpoint label keys from the datasource, such as Tempo `client` and `server`. Refer to [Endpoint label keys](#endpoint-label-keys). |

These proposed additions to `@grafana/data` do not yet exist in core Grafana:

```typescript
// packages/grafana-data/src/types/dataFrameTypes.ts
export enum DataFrameType {
  // …existing twelve members…

  /** One field per node; `field.name` is the node id. */
  GraphNodesWide = 'graph-nodes-wide',
  /** One field per edge; endpoints in `field.labels`. */
  GraphEdgesWide = 'graph-edges-wide',

  // The sibling formats propose their own members:
  // graph-nodes-long / graph-edges-long   — graph-long.md
  // graph-nodes-multi / graph-edges-multi — graph-multi.md
}

/** The shape of `frame.meta.custom.graph`, for any graph format. Optional. */
export interface GraphFrameMeta {
  /**
   * Label key holding an edge's source node id, as the **datasource** names the dimension.
   * Default `'source'`. A converter that rewrites the labels to the contract's keys leaves
   * this pointing at the original, so a consumer writing a query back out — an ad-hoc
   * filter, a drilldown link — has a key the datasource will recognise.
   */
  sourceKey?: string;
  /** Label key holding an edge's target node id. Default `'target'`. See `sourceKey`. */
  targetKey?: string;
}
```

Until these members exist, the producer must use a cast:
`meta: { type: 'graph-edges-wide' as DataFrameType }`. The cast does not affect runtime behavior.
`meta.type` is a plain assignment, and each consumer test is a string comparison.

Frame meta does not remain after reshaping. No core transformation can set `meta.type`.
`rowsToFields` makes a new output frame. Thus, field shape is the primary signal for each reshaped path.
A native producer adds meta to make the kind discoverable.

## Identity

`field.name` is the mark ID and its only stable reference.

A shown name is not an ID. `getFieldDisplayName` returns `field.name` with the label set.
The result changes with the other frames in the response. For example, consider a node field `a` with
`labels: {title: 'Gateway'}`.
It appears as `a Gateway` when it is alone. It appears as `a {title="Gateway"}` after an edges frame joins the response.

| Frame content                                         | Shown name                    |
| ----------------------------------------------------- | ----------------------------- |
| `e1`, labels `{source: 'a', target: 'b'}`             | `e1 {source="a", target="b"}` |
| `a`, labels `{title: 'Gateway'}`, nodes frame alone   | `a Gateway`                   |
| `a`, labels `{title: 'Gateway'}`, with an edges frame | `a {title="Gateway"}`         |
| `Value`, labels `{source: 'a', target: 'b'}`          | `{source="a", target="b"}`    |
| `a-->b`, no labels                                    | `a-->b`                       |
| `a-->b` twice in one frame                            | `a-->b 1` and `a-->b 2`       |

A producer must give each mark a useful name. A field named `Value` adds nothing to its shown name.
It also makes `byName: 'Value'` match all marks at the same time.

A producer must make `byRegexp` patterns tolerant of labels. `byName` matches the raw name or the shown name.
`byRegexp` uses only the shown name. Thus, `/^e1$/` does not match a labeled field, but `/^e1 /` does.

A consumer must not make IDs that collide with mark IDs. A synthetic ID is an ID that the consumer makes.
It is not an override target and does not occur in the override picker.
A `byName` matcher also does not use it. Thus, the mark appears addressable, but the user cannot address it.

## Conversion between graph formats

| Source              | Destination         | Modifies data | Notes                                                                                                                                                |
| ------------------- | ------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph-edges-long`  | `graph-edges-wide`  | No            | One row becomes one field. Reserved columns become field configuration. Unreserved columns become labels. Refer to [graph-long.md](./graph-long.md). |
| `graph-nodes-long`  | `graph-nodes-wide`  | No            | The conversion uses the same operation as the edges conversion.                                                                                      |
| `graph-edges-multi` | `graph-edges-wide`  | Yes*          | A shared row grid is necessary. The frames join on their time field, and gaps become nulls.                                                          |
| `graph-edges-wide`  | `graph-edges-multi` | No            | The conversion splits one frame into one frame for each field.                                                                                       |
| `graph-*-wide`      | `graph-*-long`      | Yes           | The conversion loses data. Per-mark `config` has no destination column. It removes color, unit, links, thresholds, and style.                        |

- This conversion is possible only when the row dimensions align.
  If they do not align, [`graph-edges-multi`](./graph-multi.md) is the only applicable format. This condition is the
  reason that the format exists.

The core Rows to fields transformation does the long-to-wide pivot for table-shaped data. It does not require
configuration.
It uses the first `string` field as the field name and the first `number` field as the value.
It maps `color`, `unit`, `min`, `max`, and `decimals` columns to field configuration. It changes each other column into
a label.
It cannot write `custom.*` or `links`. A producer or a purpose-built transformation must write these values.

## Notes

- This frame is a `numeric-wide` frame with additional requirements. Each `numeric-wide` consumer can show a wide graph
  frame at this time.
- A bar chart, stat panel, or table shows one mark for each field. Per-mark color, units, links, and visibility operate
  at this time.
- The format makes each field addressable through existing Grafana mechanisms.
- `field.state.range` contains only mark values. In the row format, the color domain includes statistics, radii, and
  coordinates.
- Frame density is the cost. The field count increases as |E|. A fully connected graph with 30 nodes has 870 fields.
- The pipeline handles 870 fields. The override picker degrades first because it lists two entries for each field.
- If a graph has more than a few hundred marks, use `byRegexp`.

## References

- Grafana data plane contract: https://grafana.com/developers/dataplane/
- Contract specification, including the `typeVersion` rules:
  https://grafana.com/developers/dataplane/contract-spec
- Numeric kind, which these formats specialize:
  https://grafana.com/developers/dataplane/numeric
- The row formats: [graph-long.md](./graph-long.md)
- The one-frame-per-mark formats: [graph-multi.md](./graph-multi.md)
- The rejected matrix format: [graph-matrix.md](./graph-matrix.md)
- `DataFrameType`:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/dataFrameTypes.ts
- Rows to fields:
  https://grafana.com/docs/grafana/latest/panels-visualizations/query-transform-data/transform-data/#rows-to-fields
- Field overrides:
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- How the relations family draws a graph: [echarts-coverage.md](./echarts-coverage.md)
- The design basis, with the measurements for each rule:
  [../todo/graph-wide-history.md](../todo/graph-wide-history.md)
