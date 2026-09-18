# Relations data format reference

ECharts Relations contains graph, Sankey, and chord charts. Each chart reads one numeric field as one node or edge.

The [proposed graph-wide data plane specification](./graph-wide-proposed.md) defines the portable data shape. This reference describes how ECharts Relations reads that shape.

## Support status

The proposal uses `meta.type: 'graph-wide'` and a separate role in `meta.custom.graph.role`. The current panel does not read these proposed metadata values.

The panel uses `graph-edges-wide` and `graph-nodes-wide` as compatibility types. Each type identifies the graph format and the frame role.

The panel detects canonical edges from their labels. It detects nodes when a numeric field name matches an endpoint.

If field-shape detection is not sufficient, use the compatibility types. The panel does not use the proposed type for role selection.

## Frame meta

The panel and its converters use these metadata values:

| Meta key                         | Value                                    | Behavior                                 |
| -------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `meta.type`                      | `graph-edges-wide` or `graph-nodes-wide` | Selects the frame role                   |
| `meta.typeVersion`               | `[0, 1]`                                 | Records the compatibility format version |
| `meta.custom.graph.sourceKey`    | Endpoint label name                      | Declares a non-standard source label     |
| `meta.custom.graph.targetKey`    | Endpoint label name                      | Declares a non-standard target label     |
| `meta.custom.graph.derivedNodes` | `true`                                   | Identifies a placeholder nodes frame     |

The wide reader does not use `meta.preferredVisualisationType`. The row converter uses `nodeGraph` to identify declared Grafana Node Graph data.

These metadata values describe current compatibility behavior. They are not part of the proposed `graph-wide` type.

## Frame role resolution

The reader gives special meaning to `graph-edges-wide` and `graph-nodes-wide`. A different `frame.meta.type` value does not stop field-shape detection.

The reader uses these rules:

1. `graph-edges-wide` forces an edges role.
2. `graph-nodes-wide` forces a nodes role and prevents an edges role.
3. If no edges frame declares `graph-edges-wide`, endpoint labels or `-->` identify edges frames.
4. If an edges frame declares `graph-edges-wide`, the reader uses only declared edges frames.
5. A numeric field name that matches an endpoint identifies a nodes frame.
6. If a real nodes frame declares `graph-nodes-wide`, the reader uses only declared nodes frames.
7. If all declared nodes frames are placeholders, the reader also adds nodes frames that match by shape.

The nodes shape test applies to the frame. If one numeric field matches an endpoint, the reader keeps all numeric fields in that frame.

The reader does not report an error for fields that do not match a graph role. It leaves those fields as remainder data.

## A role is one-to-many

The reader can collect many frames for each role. It combines their marks in frame order.

This behavior accepts graph multi data and responses from many queries. The role resolution rules select the frames that contribute.

## Graph edges wide format (`graph-edges-wide`)

Each numeric field in an edges frame is one edge. The field uses the [edge field properties](./graph-wide-proposed.md#edges-role) from the proposal.

The panel also accepts compatibility endpoint labels and field names. It examines endpoint label pairs in this order:

1. A complete pair in `meta.custom.graph.sourceKey` and `meta.custom.graph.targetKey`.
2. `source` and `target`.
3. `client` and `server`.
4. `src` and `dst`.
5. `from` and `to`.
6. A split of the field name on `-->`.

The metadata pair must contain both keys. The reader ignores a pair that contains only one key.

### The separator

The `-->` separator is compatibility input. New data must use `source` and `target` labels.

If endpoint labels are absent, `a-->b` identifies an edge from `a` to `b`. The reader uses the first separator by default.

If other labels contain both split values, the reader selects that split. Endpoint labels have priority over the field name.

A long-series converter also examines `field.config.displayNameFromDS` and `frame.name`. This behavior accepts a Prometheus legend such as `{{cluster}}-->{{namespace}}`.

### Parallel edges require labels

Parallel edges join the same source and target. Each parallel edge must have a different field name and explicit endpoint labels.

The separator form cannot safely identify parallel edges. Duplicate field names do not give stable field override targets.

## Graph nodes wide format (`graph-nodes-wide`)

Each numeric field in a nodes frame is one node. The field uses the [node field properties](./graph-wide-proposed.md#nodes-role) from the proposal.

The reader keeps every numeric field in a selected nodes frame. An edge does not need to refer to each node.

If node IDs are duplicated, the first real node field supplies the value and field configuration. An earlier placeholder does not replace real data.

### Derived nodes

A derived node comes from an edge endpoint when no nodes frame declares it. The panel can add placeholder node fields before Grafana applies field overrides.

The panel marks a placeholder frame with `meta.custom.graph.derivedNodes: true`. A later real nodes frame can supply the value and field configuration for the same ID.

If the host does not run this pre-pass, the panel creates nodes during conversion. These fallback nodes have no field configuration.

For more information, refer to [Derived nodes](../docs/relations-derived-nodes.md).

## Values and time

Only a `FieldType.time` field defines a row dimension. A string field does not define one.

The panel treats a frame as instant when it has no time field. It also treats declared `numeric-wide`, `numeric-multi`, and `numeric-long` frames as instant.

An instant frame uses reducers. The first reducer supplies the main statistic. Each additional reducer supplies one tooltip row.

A ranged frame can use a selected row from the shared graph timeline. If the panel does not select a row, it uses reducers.

The panel reads `field.labels.secondarystat` when the selected reducers do not supply extra statistics. This compatibility rule applies to nodes and edges.

If an edge value is null, the panel uses `1` as the ECharts link weight. A null node value remains null.

## Field configuration

The panel reads standard Grafana field configuration for each graph mark.

| `field.config`                                   | Nodes                                 | Edges                                 |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------- |
| `displayName`                                    | Visible node title                    | Display name for Grafana tools        |
| `color`                                          | Mark color                            | Mark color                            |
| `unit` / `decimals` / `mappings` / `min` / `max` | Value format                          | Value format                          |
| `thresholds`                                     | Value format and value-based color    | Value format and value-based color    |
| `links`                                          | Data links                            | Data links                            |
| `filterable`                                     | Enables ad hoc filters for this field | Enables ad hoc filters for this field |
| `custom.hideFrom.viz`                            | Hides the node                        | Hides the edge                        |

`displayName` does not define a visible edge label. The panel can show the formatted weight on the edge.

The edge tooltip title uses `source → target`. The panel reads only `custom.hideFrom.viz` from `hideFrom`.

### ECharts field configuration

These keys control the ECharts relations charts. Another consumer does not need to read them.

| Field key                   | Graph                                           | Sankey                        | Chord                         |
| --------------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------- |
| Node `displayName`          | Node title                                      | Node title                    | Node title                    |
| Node `custom.subtitle`      | Tooltip row                                     | Tooltip row                   | Tooltip row                   |
| Node `custom.nodeRadius`    | ECharts symbol diameter in pixels               | Ignored                       | Ignored                       |
| Node `custom.icon`          | Stored but not shown                            | Stored but not shown          | Stored but not shown          |
| Node `custom.fixedX/fixedY` | Both values work when the panel layout is unset | Fractions from 0 through 1    | Ignored                       |
| Edge `color`                | Link color outside palette modes                | Ribbon color outside palettes | Ribbon color outside palettes |
| Edge `custom.lineWidth`     | Line width                                      | Ignored                       | Ignored                       |
| Edge `custom.lineType`      | `solid`, `dashed`, or `dotted`                  | Ignored                       | Ignored                       |
| Edge `custom.curveness`     | Per-edge curvature                              | Ignored                       | Ignored                       |
| `custom.hideFrom.viz`       | Hides the node or edge                          | Hides the node or edge        | Hides the node or edge        |

For a fixed graph layout, every node must supply both coordinates. The `relationsLayout` value must be unset.

Sankey reads both coordinates only when each value is from `0` through `1`. Chord ignores the coordinates.

The legacy converter stores `custom.icon`. The panel does not expose or render it.

## Ad hoc filters

Topology keys identify endpoint labels in the response. Filter keys identify label names that a data source accepts in a query.

The panel reuses `sourceKey` and `targetKey` as filter keys. This behavior is for compatibility with existing data.

The panel can recover filter keys from labels that contain the endpoint values. It compares the source and target values with every other label value.

The recovery excludes the label pair that supplied the endpoints.

The panel recovers both ends or neither end. It recovers nothing when one endpoint has no single match.

If a self-loop has the same value at both ends, the panel uses the first two other labels with that value. It recovers nothing unless the match count is two.

Different edges in one frame can recover different filter-key pairs. The panel does not read a `filterKeys` tuple at this time.

The panel creates an ad hoc filter only when `field.config.filterable === true`. If no related field enables filters, the panel does not create them.

## Identity

The panel uses `field.name` as the stable mark ID. It does not use `getFieldDisplayName` as an ID.

Do not use a generic name such as `Value` for many marks. A `byName` override can then match many marks at the same time.

The reader can make a private key for repeated names. This key is not a field override target and is not a stable ID.

<a id="converting-between-graph-formats"></a>

## Legacy row data to wide data

The panel can convert the [Grafana Node Graph row format](./graph-long.md) to wide fields. The `legacyToWide` converter does not preserve all input data.

The converter preserves these items:

- Edge and node IDs.
- Edge `source` and `target` values.
- Numeric `mainstat` values.
- Node `secondarystat` as `labels.secondarystat`.
- Node title, subtitle, fixed color, size value, icon value, and fixed coordinates.
- Edge fixed color and thickness.
- `detail__*` values as labels.
- Unit, decimals, minimum, maximum, mappings, and thresholds from `mainstat`.

The converter approximates an SVG `strokedasharray` as `dashed` or `dotted`. It sends `noderadius` to ECharts as a symbol diameter.

If an edge has no numeric `mainstat`, the converter uses numeric `thickness` as the weight. If both values are absent, it uses `1`.

The converter drops these items:

- String statistics.
- Edge secondary statistics.
- `arc__*` values.
- Highlighting and instrumentation.
- Field data links and field configuration that the preserved list does not name.

## Conversion to row data

A converter to the row format can preserve style only when the row format has a matching column. Matching columns include `color`, `thickness`, `strokedasharray`, `noderadius`, and `icon`.

The row format has one shared field configuration for each column. It cannot preserve different field configuration for each mark.

## Conversion between wide and multi

A wide frame can split into one multi frame for each mark without a change to mark data. A multi response can join into a wide frame only when row dimensions align.

The join adds null values for missing rows. If row dimensions do not align, keep the multi format.

## References

- [Proposed graph-wide data plane specification](./graph-wide-proposed.md)
- [Grafana data plane contract](https://grafana.com/developers/dataplane/)
- [Grafana Node Graph Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api)
- [Grafana field overrides](https://grafana.com/docs/grafana/latest/panels-visualizations/configure-overrides/)
- [ECharts graph series](https://echarts.apache.org/en/option.html#series-graph)
- [ECharts Sankey series](https://echarts.apache.org/en/option.html#series-sankey)
- [ECharts chord series](https://echarts.apache.org/en/option.html#series-chord)
- [Relations render coverage](./echarts-coverage.md)
