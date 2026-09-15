# Wide graph data frame kind

A graph contains nodes and edges. An edge joins a source node to a target node.

In the wide format, each numeric field is one graph mark. A mark is one node or one edge.
The field name identifies the mark. The field values contain its numeric measurements.

This document defines the portable graph contract first. It then describes optional consumer behavior and the current
relations panel compatibility rules.

## Status and scope

This kind is proposed. `DataFrameType` in `@grafana/data` 13.1.1 does not contain a graph kind.
This proposal uses `typeVersion` `[0, 1]`. The format is defined, but it can change.

The data plane defines a type as a kind plus a format. Nodes and edges are two roles in one graph response.
They are not two data types. Grafana does not support a response that contains multiple data types at this time.

The proposed type is `graph-wide`. Each graph frame declares a `nodes` or `edges` role in `meta.custom.graph.role`.
The current relations panel does not read this proposed metadata yet. Refer to
[Current relations panel compatibility](#current-relations-panel-compatibility) when you write data for this panel.

The related graph formats are:

- [graph-long.md](./graph-long.md), where each row is one mark.
- [graph-multi.md](./graph-multi.md), where each frame is one mark.
- [graph-matrix.md](./graph-matrix.md), which records the rejected matrix design.

## Normative core

The normative core is the part that each producer and consumer must implement. Optional panel features do not change
the core.

A response must contain one or more edges frames. It can also contain zero or more nodes frames.
A nodes frame without an edges frame is a table, not a graph.

<a id="frame-meta"></a>

Each graph frame must set these metadata values:

| Meta key                 | Value              | Purpose                                   |
| ------------------------ | ------------------ | ----------------------------------------- |
| `meta.type`              | `graph-wide`       | Identifies the graph kind and wide format |
| `meta.typeVersion`       | `[0, 1]`           | Identifies this proposed version          |
| `meta.custom.graph.role` | `nodes` or `edges` | Identifies the role of the frame          |

Do not set `meta.preferredVisualisationType` to `nodeGraph` for this contract. The Grafana Node Graph Data API still
requires row fields named `id`, `source`, and `target`. It does not accept this wide shape.

### Common field rules

Each mark must be a field with `FieldType.number`. Each non-null value must be a finite number.
A null value means that the mark has no measurement for that row.

Each mark must have a unique `field.name` in the response. The name is the stable mark ID.
The unique name lets field overrides, legends, tooltips, and links refer to the same mark.

A frame can have one `FieldType.time` field. This field is the row dimension and is not a mark.
A string field is not a row dimension. Other fields are remainder data.

All fields in a frame must have the frame length. The contract assumes a square data frame.

### Edges role

An edges frame has `meta.custom.graph.role: 'edges'`. Each numeric field in the mark set represents one edge.

An edge field must use these values:

| Location              | Meaning                   |
| --------------------- | ------------------------- |
| `field.name`          | Unique edge ID            |
| `field.labels.source` | Source node ID            |
| `field.labels.target` | Target node ID            |
| `field.values`        | Numeric edge measurements |

The `source` and `target` labels are the canonical topology keys. Topology identifies the nodes that the edge joins.
Each endpoint value refers to a node ID.

The consumer selects one numeric value for each edge. Flow charts use this value as the ribbon weight.
A consumer can use a value of `1` when the selected value is null.

The edge ID does not become a visible edge label. A consumer can show the formatted weight on the edge.
It can show `source → target` as the tooltip title.

Example:

| Type: Number<br>Name: gw-api<br>Labels: {"source": "gateway", "target": "api"} | Type: Number<br>Name: api-db<br>Labels: {"source": "api", "target": "db"} |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1200                                                                           | 800                                                                       |

### Nodes role

A nodes frame has `meta.custom.graph.role: 'nodes'`. Each numeric field in the mark set represents one node.

A node field must use these values:

| Location       | Meaning                   |
| -------------- | ------------------------- |
| `field.name`   | Unique node ID            |
| `field.values` | Numeric node measurements |

The node ID is the value that an edge uses in its `source` and `target` labels. A node can exist without an edge
reference. The consumer must keep that node.

A nodes frame is optional. If it is absent, the consumer can create the node set from all edge endpoints.
These derived nodes have no numeric measurements or field configuration.

Example:

| Type: Number<br>Name: gateway<br>Labels: {"zone": "us-east-1"} | Type: Number<br>Name: api<br>Labels: nil |
| -------------------------------------------------------------- | ---------------------------------------- |
| 12                                                             | 8                                        |

### Remainder data and invalid responses

Remainder data is data that is not part of the graph mark set. A consumer can ignore it or use it for another purpose.
The consumer must identify remainder data separately from graph data.

These items are remainder data:

- Each field that is not numeric, except for the first time field.
- Each numeric field in an edges frame that has no usable endpoints.
- Each frame that does not declare a graph role.

An unresolved numeric field is not an invalid edge. It is remainder data.
An unreferenced node in a nodes frame is graph data, not remainder data.

An explicitly typed response is invalid when it breaks a normative rule. Examples include a missing frame role,
duplicate mark names, and unequal field lengths. A consumer must treat an invalid typed response as an error.

## Portable field configuration

Field configuration is optional. The portable contract uses standard Grafana field configuration.
It does not require an ECharts-specific key.

| `field.config`                                   | Nodes                                 | Edges                                  |
| ------------------------------------------------ | ------------------------------------- | -------------------------------------- |
| `displayName`                                    | Visible node title                    | Display name for generic Grafana tools |
| `color`                                          | Mark color                            | Mark color                             |
| `unit` / `decimals` / `mappings` / `min` / `max` | Value format                          | Value format                           |
| `thresholds`                                     | Value format and value-based color    | Value format and value-based color     |
| `links`                                          | Data links                            | Data links                             |
| `filterable`                                     | Enables ad hoc filters for this field | Enables ad hoc filters for this field  |
| `custom.hideFrom.viz`                            | Hides the mark from the visualization | Hides the mark from the visualization  |

`displayName` does not define an edge label in the relations panel. The panel shows the edge weight when edge values
are enabled. The edge tooltip title is `source → target`.

The relations panel reads only `custom.hideFrom.viz`. It does not apply separate `legend` or `tooltip` visibility to a
graph mark.

## Consumer capabilities

The wire contract supplies numeric value sequences. The consumer decides how it selects or reduces those values.
A reducer combines a value sequence into one value.

### Values and extra statistics

The relations panel uses the first selected reducer for the main statistic. It emits one extra tooltip row for each
remaining reducer. This rule applies to nodes and edges.

The number of reducers is not part of the wire contract. A consumer can use one reducer or many reducers.
If there is one selected row, the panel does not emit reducer-based extra statistics.

The relations panel also accepts `field.labels.secondarystat` as a compatibility carrier. It uses this label only when
the selected reducers do not supply extra statistics.

### Relations panel configuration

The following keys are specific to the relations panel. Another consumer can ignore them.

| Field key                   | Graph                                           | Sankey                        | Chord                         |
| --------------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------- |
| Node `displayName`          | Node title                                      | Node title                    | Node title                    |
| Node `custom.subtitle`      | Tooltip row                                     | Tooltip row                   | Tooltip row                   |
| Node `custom.nodeRadius`    | ECharts symbol diameter in pixels               | Ignored                       | Ignored                       |
| Node `custom.icon`          | Stored but not rendered                         | Stored but not rendered       | Stored but not rendered       |
| Node `custom.fixedX/fixedY` | Both values work when the panel layout is unset | Fractions from 0 through 1    | Ignored                       |
| Edge `color`                | Link color outside palette modes                | Ribbon color outside palettes | Ribbon color outside palettes |
| Edge `custom.lineWidth`     | Line width                                      | Ignored                       | Ignored                       |
| Edge `custom.lineType`      | `solid`, `dashed`, or `dotted`                  | Ignored                       | Ignored                       |
| Edge `custom.curveness`     | Per-edge curvature                              | Ignored                       | Ignored                       |
| `custom.hideFrom.viz`       | Hides the node or edge                          | Hides the node or edge        | Hides the node or edge        |

For a fixed graph layout, every node must provide both coordinates and `relationsLayout` must be unset. The graph then
uses the supplied coordinates. Sankey reads both coordinates only when each value is from `0` through `1`.

The panel stores `custom.icon` during legacy conversion. It does not register an icon field option and does not send an
icon to ECharts.

### Filter keys

Topology keys and filter keys have different purposes. Topology keys identify the endpoint labels in the response.
Filter keys identify the label names that a data source accepts in a query.

The portable graph topology always uses `source` and `target`. A consumer that creates queries can accept an explicit
per-edge filter pair, such as `field.config.custom.filterKeys: ['client', 'server']`.
The pair must contain both keys or be absent.

`filterKeys` is an optional consumer capability. It is not part of the normative graph core.
The current relations panel does not read this tuple yet. Refer to [Filter-key recovery](#filter-key-recovery) for its
current compatibility behavior.

## Current relations panel compatibility

This section is non-normative. It describes input that the current relations panel accepts in addition to the portable
core. A new graph consumer can implement the normative core without these rules.

The current panel uses the strings `graph-edges-wide` and `graph-nodes-wide`. It uses these strings as both type and
role. This behavior predates the proposed `graph-wide` type and explicit role.

### Frame role resolution

The current reader gives special meaning only to `graph-edges-wide` and `graph-nodes-wide`. A different
`frame.meta.type` value does not block shape inference.

The reader uses these compatibility rules:

1. `graph-edges-wide` forces an edges role.
2. `graph-nodes-wide` forces a nodes role and prevents an edges role.
3. If no edges frame declares `graph-edges-wide`, the reader finds edges by endpoint labels or by `-->` in a numeric field name.
4. If any edges frame declares `graph-edges-wide`, the reader uses only declared edges frames.
5. The reader finds a nodes frame by shape when any numeric field name matches a collected endpoint.
6. If a real nodes frame declares `graph-nodes-wide`, the reader uses only declared nodes frames.
7. If all declared nodes frames are derived placeholders, the reader also appends nodes frames that match by shape.

The nodes shape test applies to the frame, not to each field. If one numeric field matches an endpoint, the reader keeps
all numeric fields in that frame. This rule keeps unconnected nodes that share a matched frame.

If node IDs repeat, the first real node field supplies the value and configuration. A derived placeholder can appear in
an earlier frame without winning. Refer to [Derived nodes](#derived-nodes).

### A role is one-to-many

The current reader can collect many frames for one role. It combines their marks in frame order.
This behavior supports the multi format and responses from multiple queries.

The compatibility filters in [Frame role resolution](#frame-role-resolution) decide which frames contribute. They are
reader behavior, not rules in the portable contract. The portable contract uses an explicit role on each graph frame.

### Graph edges wide format (`graph-edges-wide`)

This name is the current relations panel compatibility type for an edges frame. Its mark fields use the edge rules from
the normative core.

The reader also accepts non-canonical endpoint labels and names that contain `-->`. These rules exist for CSV,
Prometheus legends, older queries, and transformations. New producers must write canonical `source` and `target` labels.

### Endpoint label keys

The current reader checks endpoint label pairs in this order:

1. A complete pair in `meta.custom.graph.sourceKey` and `meta.custom.graph.targetKey`.
2. `source` and `target`.
3. `client` and `server`.
4. `src` and `dst`.
5. `from` and `to`.
6. A split of the field name on `-->`.

The legacy metadata needs two optional properties. A half declaration is ignored.
A future compatibility shape can use one tuple: `endpointKeys: ['client', 'server']`.

The current reader also reuses `sourceKey` and `targetKey` as filter keys. This overload is compatibility behavior.
`endpointKeys` identifies topology labels only. A separate `filterKeys` pair identifies query labels.
The current reader does not read either tuple yet.

### Filter-key recovery

Filter-key recovery is optional compatibility behavior. It guesses data source filter keys from labels that repeat the
endpoint values. A new consumer does not need this behavior to render a graph.

The current panel runs recovery for each edge. It compares the source and target values with every other label value.
It excludes only the label pair that supplied the endpoints.

The panel recovers both ends or neither end. It recovers nothing when one endpoint has no single match.
It also recovers nothing when a value has more than one matching label.

A self-loop has the same value at both ends. The panel uses the first two other labels that contain that value.
It recovers nothing when the match count is not two.

This feature supports a multi-level flow. Different edges in one frame can recover different filter-key pairs.
An explicit per-edge `filterKeys` tuple is clearer and does not need value matching.

The panel creates an ad hoc filter only when `field.config.filterable === true`. If no related field opts in, the panel
does not create filters.

### The separator

The `-->` separator is compatibility input. New producers must use endpoint labels.

If endpoint labels are absent, `a-->b` identifies an edge from `a` to `b`. The reader uses the first separator by
default. If other labels contain both split values, the reader can select that corroborated split.

Labels take priority over a name split. A node ID that contains `-->` needs explicit endpoint labels or labels that
corroborate the split.

A long-series converter also checks `field.config.displayNameFromDS` and `frame.name`. This behavior supports a
Prometheus `legendFormat` such as `{{cluster}}-->{{namespace}}`.

### Parallel edges require labels

Parallel edges join the same source and target. Each parallel edge must have a different field name.
Each field must also contain explicit endpoint labels.

The name-split form cannot safely identify parallel edges. Two fields named `a-->b` do not provide stable override
targets. The display-name suffixes depend on field order.

### Graph nodes wide format (`graph-nodes-wide`)

This name is the current relations panel compatibility type for a nodes frame. Its mark fields use the node rules from
the normative core.

The reader keeps every numeric field in a selected nodes frame. An edge does not need to refer to each node.
The reader uses the first real field for a repeated node ID.

### Derived nodes

A derived node comes from an edge endpoint when no nodes frame declares it. The panel can add placeholder node fields
before Grafana applies field overrides.

The panel marks a placeholder frame with `meta.custom.graph.derivedNodes: true`. A later real nodes frame can supply the
value and configuration for the same ID. The placeholder keeps its earlier position but does not replace real data.

If the host does not run this pre-pass, the panel creates nodes during conversion. These fallback nodes have no field
configuration. Refer to [relations-derived-nodes.md](../docs/relations-derived-nodes.md).

### Time and instant data

Only a `FieldType.time` field defines a row dimension. A string field never defines one.

The current reader treats a frame as instant when it has no time field. It also treats declared `numeric-wide`,
`numeric-multi`, and `numeric-long` frames as instant when they contain a time field.

An instant frame uses reducers. A ranged frame can use a selected row from the shared graph timeline.

## Identity

`field.name` is the stable mark ID. `getFieldDisplayName` is not an ID because labels and other response frames can
change it.

A producer must not use a generic name such as `Value` for several marks. A `byName` override can then match several
marks at the same time. The override picker also shows duplicate entries.

The consumer can make a private key to distinguish repeated names. That key is not a field override target.
It must not be presented as a stable ID.

## Converting between graph formats

Conversion behavior is non-normative. A producer can emit the wide format directly and avoid these compatibility
rules.

### Legacy long to wide

The current `legacyToWide` converter is lossy. It preserves this subset:

- Edge and node IDs.
- Edge `source` and `target` values.
- Numeric `mainstat` values.
- Node `secondarystat` as `labels.secondarystat`.
- Node title, subtitle, fixed color, size value, icon value, and fixed coordinates.
- Edge fixed color and thickness.
- `detail__*` values as labels.
- Unit, decimals, minimum, maximum, mappings, and thresholds from the `mainstat` field.

The converter changes some values. It approximates an SVG `strokedasharray` as `dashed` or `dotted`.
If an edge has no numeric `mainstat`, it uses numeric `thickness` as the edge weight. If both values are absent, it uses
the weight `1`.
It sends `noderadius` to an ECharts symbol diameter without scaling the value.

The converter drops string-valued statistics, edge secondary statistics, `arc__*` values, highlighting, and
instrumentation. It also drops field data links and other configuration that the preserved subset does not name.

### Wide to legacy long

A purpose-built converter can preserve color and style when the long format has a matching column. These mappings
include `color`, `thickness`, `strokedasharray`, `noderadius`, and `icon`.

The long format has one shared field configuration for each column. It cannot preserve different formatting
configuration for each mark. It also cannot preserve data links or custom values that have no dedicated column.

### Wide and multi

A wide frame can split into one multi frame for each mark without changing mark data. A multi response can join into a
wide frame only when the row dimensions align. The join adds null values for missing rows.

If row dimensions do not align, keep the multi format. Do not make a false shared row grid.

## References

- Grafana data plane contract: https://grafana.com/developers/dataplane/
- Grafana contract specification: https://grafana.com/developers/dataplane/contract-spec
- Grafana numeric kind: https://grafana.com/developers/dataplane/numeric
- Grafana Node Graph Data API:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- Grafana field overrides:
  https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/
- ECharts graph series: https://echarts.apache.org/en/option.html#series-graph
- ECharts Sankey series: https://echarts.apache.org/en/option.html#series-sankey
- ECharts chord series: https://echarts.apache.org/en/option.html#series-chord
- Relations render coverage: [echarts-coverage.md](./echarts-coverage.md)
- Relations design history: [graph-wide-history.md](../todo/graph-wide-history.md)
