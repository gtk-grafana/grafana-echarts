# Node graph

A **node graph** visualizes elements (nodes) and the relationships between them
(edges). Grafana models it as a pair of column-oriented data frames: an **edges**
frame and an optional **nodes** frame.

> **Not a data plane contract kind.** Unlike the other docs in this folder
> (Numeric, Heatmap, ...), node graph is **out of the Grafana data plane
> contract**. It carries no `frame.meta.type`. Grafana identifies it through a
> separate routing signal (`frame.meta.preferredVisualisationType`) and field/
> frame naming conventions. This doc documents the **input frame format** Grafana
> expects; the plugin does **not** consume these frames yet (see
> [../todo/node-graph.md](../todo/node-graph.md)).

Field names below come from Grafana's `NodeGraphDataFrameFieldNames` enum
(`packages/grafana-data/src/utils/nodeGraph.ts`) and the node graph
[panel Data API](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api).
All field names are **lowercase**.

## Detection

Grafana treats a response as a node graph when any of the following hold:

- `frame.meta.preferredVisualisationType === 'nodeGraph'`, or
- the frame `name` or `refId` is `nodes` or `edges`, or
- a frame contains an `id` field.

At minimum a node graph requires the **edges** frame; Grafana computes the nodes
and their stats from the edges when no nodes frame is supplied. A **nodes** frame
is added when node-specific metadata (titles, stats, colors, ...) is needed.

## Edges frame

One row per relationship (edge).

### Required fields

| Field name | Type   | Description                    |
| ---------- | ------ | ------------------------------ |
| `id`       | string | Unique identifier of the edge. |
| `source`   | string | `id` of the source node.       |
| `target`   | string | `id` of the target node.       |

### Optional fields

| Field name        | Type          | Description                                                                                                                   |
| ----------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mainstat`        | string/number | First stat shown when hovering the edge. A string is shown as-is; a number also shows its field unit.                         |
| `secondarystat`   | string/number | Same as `mainstat`, shown right under it.                                                                                     |
| `detail__*`       | string/number | Any field prefixed `detail__` is shown in the edge's context menu header. Use `config.displayName` for a readable label.      |
| `thickness`       | number        | Thickness of the edge. Default `1`.                                                                                           |
| `color`           | string        | Default edge color. Any valid HTML color string. Default `#999`.                                                              |
| `strokedasharray` | string        | SVG `stroke-dasharray` pattern of dashes and gaps. Unset renders a solid line.                                                |
| `highlighted`     | boolean       | Whether the edge is highlighted. Default `false`. **Deprecated** (since Grafana 10.5) — use `color` to indicate highlighting. |

## Nodes frame

One row per node. Optional overall — supply it only when nodes need metadata
beyond what the edges frame implies.

### Required fields

| Field name | Type   | Description                                                            |
| ---------- | ------ | ---------------------------------------------------------------------- |
| `id`       | string | Unique node identifier, referenced by an edge's `source` and `target`. |

### Optional fields

| Field name       | Type          | Description                                                                                                                                                                                 |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | string        | Name shown just under the node.                                                                                                                                                             |
| `subtitle`       | string        | Additional name/type/identifier shown under the title.                                                                                                                                      |
| `mainstat`       | string/number | First stat shown inside the node. String as-is; number also shows its field unit.                                                                                                           |
| `secondarystat`  | string/number | Same as `mainstat`, shown under it inside the node.                                                                                                                                         |
| `arc__*`         | number        | Any field prefixed `arc__` defines a section of the colored circle (border) around the node. Values across all `arc__*` fields should add up to 1. Color via `config.color.fixedColor`.     |
| `detail__*`      | string/number | Any field prefixed `detail__` is shown in the node's context menu header. Use `config.displayName` for a readable label.                                                                    |
| `color`          | string/number | A single color instead of `arc__*` sections. A string is an HTML color; a number is interpreted per `field.config.color.mode` (e.g. gradient by value). Must not be combined with `arc__*`. |
| `icon`           | string        | Name of a built-in Grafana icon to show inside the node instead of the default stats.                                                                                                       |
| `noderadius`     | number        | Node radius in pixels. Controls node size.                                                                                                                                                  |
| `highlighted`    | boolean       | Whether the node is highlighted. Default `false`.                                                                                                                                           |
| `fixedx`         | number        | Fixed x-coordinate for the node. If used, **all** nodes must provide a value.                                                                                                               |
| `fixedy`         | number        | Fixed y-coordinate for the node. If used, **all** nodes must provide a value.                                                                                                               |
| `isinstrumented` | boolean       | Whether the node is instrumented.                                                                                                                                                           |

## Example

**Nodes**

| id    | title | subtitle | mainstat | secondarystat | color | icon | highlighted |
| ----- | ----- | -------- | -------- | ------------- | ----- | ---- | ----------- |
| node1 | PC    | Windows  | AMD      | 16gbRAM       | blue  |      | true        |
| node2 | PC    | Linux    | Intel    | 32gbRAM       | green | eye  | false       |
| node3 | Mac   | MacOS    | M3       | 16gbRAM       | gray  | apps | false       |

**Edges**

| id    | source | target | mainstat | secondarystat | thickness | color  |
| ----- | ------ | ------ | -------- | ------------- | --------- | ------ |
| edge1 | node1  | node2  | TheMain  | TheSub        | 3         | cyan   |
| edge2 | node3  | node2  | Main2    | Sub2          | 1         | orange |

A node with no edge connection is drawn on its own, outside the network.

## References

- Node graph panel Data API:
  https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/#data-api
- Field-name enum `NodeGraphDataFrameFieldNames`:
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/utils/nodeGraph.ts
- `preferredVisualisationType` enum (`grafana-data/src/types/data.ts`):
  https://github.com/grafana/grafana/blob/main/packages/grafana-data/src/types/data.ts
