# Relations editor parity

This document compares the Relations panel with Grafana Node graph. It also lists options that apply only to ECharts graph, sankey, or chord.

Both panels can use the same row query. Relations converts row frames to the [graph-wide contract](../../../data-plane/graph-wide.md) before field overrides.

## Main differences

Grafana Node graph uses its own SVG renderer. It supports layered and grid layouts, arcs, icons, and a context menu.

Relations uses ECharts. It adds sankey, chord, force controls, link styles, label controls, and adjacency emphasis.

| Variant | Topology               | Node size                   | Link size       |
| ------- | ---------------------- | --------------------------- | --------------- |
| Graph   | Any directed graph     | Node radius or panel pixels | Edge line width |
| Sankey  | Directed acyclic graph | Flow                        | Weight          |
| Chord   | Any directed graph     | Flow                        | Weight          |

Sankey removes cycles before render. Graph and chord keep them.

These snapshots pin the three variants:

- [canvas: nodes and links at their defaults (four labelled symbols joined by arrowed lines)][canvas-graph]
- [canvas: the same nodes and links as flow ribbons (four bars in columns, ribbons weighted by value)][canvas-sankey]
- [canvas: the same nodes and links as a ring of arcs (four arcs, chords weighted by value)][canvas-chord]

## Default options

| Option                  | Variants      | ECharts or panel behavior       | Node graph parity          |
| ----------------------- | ------------- | ------------------------------- | -------------------------- |
| Chart type              | All           | Selects graph, sankey, or chord | ECharts only               |
| Time slider             | All           | Reads one timestamp             | ECharts only               |
| Calculation             | All           | Reduces each mark               | Different route            |
| Show node labels        | All           | `series.*.label.show`           | Data driven in core        |
| Show node values        | All           | Node label formatter            | Main stat equivalent       |
| Hide overlapping labels | All           | `labelLayout.hideOverlap`       | ECharts only               |
| Label overflow          | All           | `label.overflow`                | ECharts only               |
| Layout                  | Graph         | Force, circular, or fixed       | Partial, different choices |
| Node size               | Graph         | `symbolSize` fallback           | Partial                    |
| Zoom                    | Graph, sankey | Panel buttons and roam action   | Partial                    |
| Pan                     | Graph, sankey | `roam: 'move'`                  | ECharts only               |
| Remember view           | Graph, sankey | Saves center and zoom           | ECharts only               |
| Highlight adjacency     | All           | `emphasis.focus`                | ECharts only               |
| Link color              | All           | Source, target, or gradient     | ECharts only               |
| Edge arrows             | Graph         | Target arrowhead                | ECharts only               |
| Show edge values        | Graph, sankey | Edge label                      | ECharts only               |
| Flow direction          | Sankey        | `series.sankey.orient`          | No core sankey             |
| Node alignment          | Sankey        | `series.sankey.nodeAlign`       | No core sankey             |

The graph layout choices differ from core. Both support force. Core adds layered and grid. Relations adds circular and fixed.

Zoom uses panel buttons, not the mouse wheel. This keeps dashboard scrolling available.

Show node values is hidden when no node has a measured value. The time slider is hidden on instant data unless it is already enabled.

## Advanced options

| Option            | Variants            | ECharts behavior        |
| ----------------- | ------------------- | ----------------------- |
| Label width       | All                 | `label.width`           |
| Draggable nodes   | Fixed graph, sankey | Saves node position     |
| Repulsion         | Force graph         | `force.repulsion`       |
| Edge length       | Force graph         | `force.edgeLength`      |
| Gravity           | Force graph         | `force.gravity`         |
| Animate layout    | Force graph         | `force.layoutAnimation` |
| Animation         | Sankey, chord       | Root ECharts animation  |
| Link curveness    | Graph               | `lineStyle.curveness`   |
| Node width        | Sankey              | `nodeWidth`             |
| Node gap          | Sankey              | `nodeGap`               |
| Ribbon curveness  | Sankey              | `lineStyle.curveness`   |
| Ribbon opacity    | Sankey              | `lineStyle.opacity`     |
| Layout iterations | Sankey              | `layoutIterations`      |
| Start angle       | Chord               | `startAngle`            |
| Clockwise         | Chord               | `clockwise`             |
| Arc gap           | Chord               | `padAngle`              |
| Minimum arc angle | Chord               | `minAngle`              |
| Ribbon opacity    | Chord               | `lineStyle.opacity`     |
| Editor mode       | All                 | Shows advanced controls |

ECharts ignores the root animation option for graph. Graph uses Animate layout for force simulation steps.

Chord has no view coordinate system. It does not support zoom, pan, drag, or edge labels.

Sankey labels move below nodes in vertical flow. This avoids labels that overlap the next node.

## Field configuration

One node or edge is one field. A `byName` override can target one mark.

| Option                          | Support       | Notes                             |
| ------------------------------- | ------------- | --------------------------------- |
| Color                           | Yes           | All field color modes             |
| Unit                            | Yes           | Per mark                          |
| Decimals                        | Yes           | Per mark                          |
| Value mappings                  | Yes           | Labels, tooltips, and color       |
| Thresholds                      | Yes           | Color                             |
| Min and max                     | Yes           | Color range                       |
| Field min/max                   | Yes           | Color range                       |
| Display name                    | Override only | Renames one node                  |
| Data links                      | Yes           | Tooltip footer                    |
| Filterable                      | Yes           | Ad hoc filters                    |
| Hide from visualization         | Yes           | Hides a mark                      |
| Actions                         | No            | No action surface                 |
| No value                        | No            | Null marks omit the value         |
| Node radius                     | Override only | Graph                             |
| Subtitle                        | Override only | Tooltip                           |
| Fixed x and y                   | Override only | Fixed graph or sankey position    |
| Line width and type             | Override only | Graph                             |
| Curveness                       | Override only | Graph                             |
| Source and target filter labels | Deprecated    | Keep original labels in the query |

The first calculation controls mark color and sankey or chord size. Later calculations add tooltip rows. It does not size graph nodes or edges.

Legend hiding removes a node and each link that touches it. It removes one edge when the override targets that edge.

## Live option examples

These links need Grafana on `http://localhost:3001`. Each link opens one panel in the provisioned all-options dashboard.

| Panel                   | Example                      | Panel                   | Example                        |
| ----------------------- | ---------------------------- | ----------------------- | ------------------------------ |
| [#1 opts][live-opt-1]   | Chart type: Sankey           | [#19 opts][live-opt-19] | Node alignment: Justify        |
| [#2 opts][live-opt-2]   | Calculation: Max and Min     | [#20 opts][live-opt-20] | Flow direction: Vertical       |
| [#3 opts][live-opt-3]   | Time slider: On              | [#21 opts][live-opt-21] | Node width: 40px               |
| [#4 opts][live-opt-4]   | Show node labels: Off        | [#22 opts][live-opt-22] | Node gap: 30px                 |
| [#5 opts][live-opt-5]   | Show node values: On         | [#23 opts][live-opt-23] | Ribbon curveness: 0            |
| [#6 opts][live-opt-6]   | Hide overlapping labels: Off | [#24 opts][live-opt-24] | Sankey ribbon opacity: 0.8     |
| [#7 opts][live-opt-7]   | Label overflow: None         | [#25 opts][live-opt-25] | Layout iterations: 0           |
| [#8 opts][live-opt-8]   | Label width: 40px            | [#26 opts][live-opt-26] | Start angle: 0 degrees         |
| [#9 opts][live-opt-9]   | Show edge values: On         | [#27 opts][live-opt-27] | Clockwise: Off                 |
| [#10 opts][live-opt-10] | Layout: Fixed                | [#28 opts][live-opt-28] | Arc gap: 12 degrees            |
| [#11 opts][live-opt-11] | Node size: 45px              | [#29 opts][live-opt-29] | Minimum arc angle: 20 degrees  |
| [#12 opts][live-opt-12] | Repulsion: 1200              | [#30 opts][live-opt-30] | Chord ribbon opacity: 0.7      |
| [#13 opts][live-opt-13] | Edge length: 40              | [#31 opts][live-opt-31] | Legend: Table, right side      |
| [#14 opts][live-opt-14] | Gravity: 0.5                 | [#32 opts][live-opt-32] | Pan: On                        |
| [#15 opts][live-opt-15] | Zoom: On                     | [#33 opts][live-opt-33] | Draggable nodes: On            |
| [#16 opts][live-opt-16] | Link color: Target           | [#34 opts][live-opt-34] | Color scheme: By value         |
| [#17 opts][live-opt-17] | Edge arrows: Off             | [#35 opts][live-opt-35] | Thresholds: 50 and 80          |
| [#18 opts][live-opt-18] | Link curveness: 0.4          | [#36 opts][live-opt-36] | Value mappings: Color and text |

## Cycle policy

ECharts sankey throws when data contains a cycle. Relations sanitizes sankey links before it calls ECharts:

1. It removes self-loops.
2. It combines duplicate endpoint pairs and sums their weights.
3. It removes back edges in stable frame order.
4. It reports the number of removed links in a panel notice.

Graph and chord do not use this pass.

## Limits

- Sankey and chord ignore edge line width and line type. Their ribbons use weight.
- Sankey and chord ignore node radius and fixed graph coordinates.
- Sankey and chord keep node stats in tooltips. Flow controls their geometry.
- Relations does not render `arc__*` sections or Grafana icons.
- Relations has no node or edge context menu for `detail__*` fields.
- Proximity hover does not apply because relations charts have no Cartesian grid.
- Force layout uses integration tests instead of snapshots because simulation coordinates vary.
- Gradient graph links need fixed positions. Other graph layouts use the source color.
- Every frame that matches a role contributes marks. Declared metadata takes priority over shape.
- Derived nodes need the registered pre-pass for field overrides. See [Derived nodes](../../../docs/relations-derived-nodes.md).

A fixed graph emits a gradient only when positions are known. [This integration test pins that rule][int-layout].

## ECharts API

The module uses these [ECharts options](https://echarts.apache.org/en/option.html):

| API                              | Status    | Use                                                              |
| -------------------------------- | --------- | ---------------------------------------------------------------- |
| `series.graph`                   | Partial   | Data, links, layout, force, labels, styles, emphasis, roam, drag |
| `series.graph.categories`        | Not used  | Grafana renders the legend                                       |
| `series.graph.itemStyle`         | Partial   | Node color                                                       |
| `series.sankey`                  | Partial   | Data, links, layout, labels, styles, emphasis, roam, drag        |
| `series.sankey.levels`           | Not used  | No field maps to depth                                           |
| `series.sankey.edgeLabel`        | Not used  | Dense ribbon labels collide                                      |
| `series.chord`                   | Partial   | Data, links, ring layout, labels, styles, emphasis               |
| `series.chord.radius` / `center` | Default   | ECharts controls ring geometry                                   |
| `series.chord.endAngle`          | Default   | ECharts completes the ring                                       |
| `tooltip`                        | Partial   | Item event feeds the React tooltip                               |
| `legend`                         | Not used  | Grafana renders the legend                                       |
| `animation`                      | Supported | Sankey and chord                                                 |
| `title`                          | Not used  | Grafana renders notices                                          |
| `grid` / `xAxis` / `yAxis`       | Not used  | Relations series self-layout                                     |
| `visualMap`                      | Not used  | Grafana field color handles values                               |
| `dataZoom` / `brush` / `toolbox` | Not used  | No panel controls                                                |

Per-edge curveness works on all three ECharts series. The panel exposes it only where the result has a clear use.

Sankey node width and gap are series options. They cannot vary by node. Graph node size can vary through `symbolSize`.

[canvas-graph]: ../../lib/components/canvas-tests/relations/graph.canvas.test.tsx
[canvas-sankey]: ../../lib/components/canvas-tests/relations/sankey.canvas.test.tsx
[canvas-chord]: ../../lib/components/canvas-tests/relations/chord.canvas.test.tsx
[int-layout]: ../../lib/components/integration-tests/relations/layout.integration.test.tsx
[live-opt-1]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=1
[live-opt-2]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=2
[live-opt-3]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=3
[live-opt-4]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=4
[live-opt-5]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=5
[live-opt-6]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=6
[live-opt-7]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=7
[live-opt-8]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=8
[live-opt-9]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=9
[live-opt-10]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=10
[live-opt-11]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=11
[live-opt-12]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=12
[live-opt-13]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=13
[live-opt-14]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=14
[live-opt-15]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=15
[live-opt-16]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=16
[live-opt-17]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=17
[live-opt-18]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=18
[live-opt-19]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=19
[live-opt-20]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=20
[live-opt-21]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=21
[live-opt-22]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=22
[live-opt-23]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=23
[live-opt-24]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=24
[live-opt-25]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=25
[live-opt-26]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=26
[live-opt-27]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=27
[live-opt-28]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=28
[live-opt-29]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=29
[live-opt-30]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=30
[live-opt-31]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=31
[live-opt-32]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=32
[live-opt-33]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=33
[live-opt-34]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=34
[live-opt-35]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=35
[live-opt-36]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=36
