# Graph data frame kind

A graph contains nodes and the edges that join them. The graph-wide format stores each graph mark in one numeric field.

A mark is one node or one edge. The field name identifies the mark, and the field values contain its measurements.

Nodes and edges are roles in one graph response. They are not separate data types.

## Status

This data type is proposed. `DataFrameType` in `@grafana/data` 13.1.1 does not contain a graph data type.

The proposed type indicator is `graph-wide`. The version is 0.1.

The format is defined, but it can change after use by more producers and consumers.

## Common properties

Graph-wide data has these properties:

- A response must contain one or more edges frames.
- A response can contain zero or more nodes frames.
- Each graph frame must declare its role as `nodes` or `edges`.
- Each mark must be a field with `FieldType.number`.
- Each non-null mark value must be a finite number.
- A null value means that the mark has no measurement for that row.
- Each mark must have a unique `field.name` in the response.
- All fields in one frame must have the frame length.

A nodes frame without an edges frame is a table, not a graph.

A frame can contain one `FieldType.time` field. This field is the row dimension and is not a graph mark.

If a frame has no time field, a consumer can reduce each value sequence to one value. Value selection and reduction are consumer capabilities.

### Invalid cases

An explicitly typed response is invalid in these cases:

- A `graph-wide` frame does not declare a graph role.
- A mark field has a type other than `FieldType.number`.
- A non-null mark value is not finite.
- Two marks have the same `field.name`.
- Fields in one frame have different lengths.
- The response contains graph nodes but no graph edges.

## Graph Wide Format (GraphWide)

Version: 0.1

The format is wide because a frame gains one field for each additional graph mark.

A response can contain more than one graph frame.

### Frame metadata

Each graph frame must set these metadata values:

| Meta key                 | Value              | Purpose                                   |
| ------------------------ | ------------------ | ----------------------------------------- |
| `meta.type`              | `graph-wide`       | Identifies the graph kind and wide format |
| `meta.typeVersion`       | `[0, 1]`           | Identifies version 0.1                    |
| `meta.custom.graph.role` | `nodes` or `edges` | Identifies the frame role                 |

The `nodeGraph` preferred visualization value identifies the Grafana Node Graph row format. It does not identify this wide format.

### Edges role

An edges frame has `meta.custom.graph.role: 'edges'`. Each numeric field in the graph mark set represents one edge.

An edge field has these properties:

| Location              | Meaning                   |
| --------------------- | ------------------------- |
| `field.name`          | Unique edge ID            |
| `field.labels.source` | Source node ID            |
| `field.labels.target` | Target node ID            |
| `field.values`        | Numeric edge measurements |

The `source` and `target` labels are topology keys. Topology identifies the nodes that the edge joins.

Each endpoint value refers to a node ID. Parallel edges must have different field names.

Example:

| Type: Number<br>Name: gw-api<br>Labels: {"source": "gateway", "target": "api"} | Type: Number<br>Name: api-db<br>Labels: {"source": "api", "target": "db"} |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1200                                                                           | 800                                                                       |

### Nodes role

A nodes frame has `meta.custom.graph.role: 'nodes'`. Each numeric field in the graph mark set represents one node.

A node field has these properties:

| Location       | Meaning                   |
| -------------- | ------------------------- |
| `field.name`   | Unique node ID            |
| `field.values` | Numeric node measurements |

An edge uses the node ID in its `source` and `target` labels. A node can exist without an edge reference.

If no nodes frames are present, the node set is the union of all edge endpoints. These derived nodes have no measurements or field configuration.

Example:

| Type: Number<br>Name: gateway<br>Labels: {"zone": "us-east-1"} | Type: Number<br>Name: api<br>Labels: nil |
| -------------------------------------------------------------- | ---------------------------------------- |
| 12                                                             | 8                                        |

### Remainder data

Remainder data is data outside the graph mark set. A consumer must identify remainder data separately from graph data.

These items are remainder data:

- A frame without the `graph-wide` type indicator.
- A frame with a different type indicator.
- A field that is not numeric, except for the first time field.
- A time field after the first time field in a frame.
- A numeric field in an edges frame without usable `source` and `target` labels.

An unreferenced node in a nodes frame is graph data. It is not remainder data.

### Field configuration

This specification does not assign visualization behavior to field configuration. A consumer can use standard Grafana field configuration for its purpose.

Consumer-specific field configuration is not part of this data type.

## Related formats

- [Graph long](./graph-long.md) stores one graph mark in one row.
- [Graph multi](./graph-multi.md) stores one graph mark in one frame.
- [Graph matrix](./graph-matrix.md) records a rejected adjacency-matrix design.
- [ECharts graph-wide implementation](./graph-wide.md) describes one consumer of this proposal.

## References

- [Grafana data plane contract](https://grafana.com/developers/dataplane/)
- [Grafana data plane contract specification](https://grafana.com/developers/dataplane/contract-spec)
- [Grafana numeric data frame kind](https://grafana.com/developers/dataplane/numeric)
- [Grafana time series data frame kind](https://grafana.com/developers/dataplane/timeseries)
