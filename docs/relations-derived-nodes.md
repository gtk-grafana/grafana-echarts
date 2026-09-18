# Derived nodes

A derived node appears in an edge but not in a nodes frame. The panel builds it from a `source` or `target` value.

Prometheus, Loki, and edge-only row responses often produce derived nodes. The [proposed graph-wide specification](../data-plane/graph-wide-proposed.md) permits them.

## Limits without the pre-pass

A mark is one Grafana field. Field overrides apply before the panel reads the data.

A derived node created inside the panel has no field. It cannot receive field configuration.

| Capability                           | Declared node  | Node created inside the panel |
| ------------------------------------ | -------------- | ----------------------------- |
| Color and overrides                  | Yes            | Classic palette only          |
| Unit, decimals, mappings, thresholds | Yes            | No                            |
| Radius, subtitle, and fixed position | Yes            | No                            |
| Data links                           | Yes            | No                            |
| Ad hoc filters                       | Yes            | Uses edge configuration       |
| Hide from visualization              | Field override | Name match                    |
| Override picker                      | Listed         | Not listed                    |

A derived node has no measured value. The panel does not use its link count as a value.

## Pre-pass

`deriveNodes.ts` runs before Grafana applies field overrides. It adds a numeric field for each missing endpoint.

The pre-pass runs after the long or row converter. It also runs on data that is already wide.

It follows these rules:

- It returns the same frame array when no nodes are missing.
- It appends fields to an existing nodes frame.
- It marks a new placeholder frame with `meta.custom.graph.derivedNodes`.
- It puts a new frame first to keep palette order stable.
- It stores `null` because an edge count is not a measurement.

A placeholder does not replace a real nodes frame created by a later user transformation. The reader combines the placeholder with that frame. A real field supplies the value and configuration.

The plugin registers the pre-pass with `PanelPlugin.setDataTransformations`. This feature is experimental in Grafana 13.3. Enable `grafana.panelPluginTransformations` to use it.

## Tooltip

A node with a value shows that value. A node without a value lists up to ten adjacent edges.

```text
gateway
web →        800 ms
→ API          1.2 s
→ gateway          4
```

The arrow shows the edge direction. Each edge uses its own field format. A self-loop appears once.

The tooltip uses edge fields for ad hoc filters because endpoint labels belong to edges. A declared node uses its own `filterable` value first.

## Fallback

If the host does not run the pre-pass, the panel creates missing nodes during conversion. The graph still renders, but those nodes have no field configuration.

Legend hiding matches those fallback nodes by name. Relations data must not use `stripHiddenValueFields` because the reader will derive a removed node again.

## Related guides

- [Proposed graph-wide specification](../data-plane/graph-wide-proposed.md)
- [ECharts graph-wide implementation](../data-plane/graph-wide.md)
- [Relations data sources](./relations-data-sources.md)
- [Relations option parity](../src/modules/relations/parity.md)
- [Tooltip-link dashboard](../provisioning/dashboards/relations/per-mark-tooltip-links.json)
