# Relations editor parity

This document compares the Relations panel with Grafana Node graph. It also lists options that apply only to ECharts graph, sankey, or chord.

Both panels can use the same row query. Relations converts row frames to the [ECharts graph-wide format](../../../data-plane/graph-wide.md) before field overrides.

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

Each Test cell points to automated evidence. Canvas and integration links use exact test names. Each Dashboard cell points to committed provisioned JSON.

| Option                  | Variants      | ECharts or panel behavior       | Node graph parity          | Test                                                                                                                                                                                                                                                                                                                                                                                                                           | Dashboard                                                                     |
| ----------------------- | ------------- | ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Chart type              | All           | Selects graph, sankey, or chord | ECharts only               | [canvas: the same nodes and links as flow ribbons (four bars in columns, ribbons weighted by value)][canvas-sankey], [canvas: the same nodes and links as a ring of arcs (four arcs, chords weighted by value)][canvas-chord], [variant unit][rel-chart]                                                                                                                                                                       | [sankey.json][db-sankey], [chord.json][db-chord], [all-options.json][db-opts] |
| Time slider             | All           | Reads one timestamp             | ECharts only               | [canvas: the graph at the earliest timestamp, under the slider strip (edge weights 1 and 10)][canvas-timeline], [integration: builds a different graph at an earlier timestamp than the reducer draws][int-timeline], [integration: repaints the chart when the slider is moved][int-timeline], [integration: shortens the chart by exactly the strip][int-timeline], [time-stop unit][time-stops], [editor unit][ed-timeline] | [timeline.json][db-timeline], [all-options.json][db-opts]                     |
| Calculation             | All           | Reduces each mark               | Different route            | [calculation unit][wide-conv]                                                                                                                                                                                                                                                                                                                                                                                                  | [all-options.json][db-opts]                                                   |
| Show node labels        | All           | `series.*.label.show`           | Data driven in core        | [canvas: node labels off (symbols and links, no text)][canvas-graph], [canvas: node labels off (bars and ribbons, no text)][canvas-sankey], [canvas: node labels off (arcs and chords, no text)][canvas-chord], [label unit][graph-labels]                                                                                                                                                                                     | [all-options.json][db-opts]                                                   |
| Show node values        | All           | Node label formatter            | Main stat equivalent       | [label formatter unit][graph-labels]                                                                                                                                                                                                                                                                                                                                                                                           | [all-options.json][db-opts]                                                   |
| Hide overlapping labels | All           | `labelLayout.hideOverlap`       | ECharts only               | [integration: a node label that would collide with one already drawn is dropped][int-labels], [integration: a chord ring of collapsed arcs drops the labels that stack up][int-labels], [label-layout unit][graph-labels]                                                                                                                                                                                                      | [readability.json][db-read], [all-options.json][db-opts]                      |
| Label overflow          | All           | `label.overflow`                | ECharts only               | [integration: a long name is cut at the label width and ends in an ellipsis][int-labels], [integration: break mode wraps a long name over several lines instead of cutting it][int-labels], [label-style unit][graph-labels]                                                                                                                                                                                                   | [readability.json][db-read], [all-options.json][db-opts]                      |
| Layout                  | Graph         | Force, circular, or fixed       | Partial, different choices | [canvas: fixed coordinates from the data (nodes at the server's x and y, not on a ring)][canvas-graph], [integration: every node is drawn even when the data pins nothing][int-layout], [layout unit][graph-layout]                                                                                                                                                                                                            | [node-graph-testdata.json][db-testdata], [all-options.json][db-opts]          |
| Node size               | Graph         | `symbolSize` fallback           | Partial                    | [graph option unit][graph-opts]                                                                                                                                                                                                                                                                                                                                                                                                | [all-options.json][db-opts]                                                   |
| Zoom                    | Graph, sankey | Panel buttons and roam action   | Partial                    | [integration: the roam action scales the view while scroll-to-zoom stays off][int-interaction], [zoom action unit][rel-chart], [view unit][graph-view]                                                                                                                                                                                                                                                                         | [readability.json][db-read], [all-options.json][db-opts]                      |
| Pan                     | Graph, sankey | `roam: 'move'`                  | ECharts only               | [view unit][graph-view], [graph option unit][graph-opts], [sankey option unit][sankey-opts]                                                                                                                                                                                                                                                                                                                                    | [readability.json][db-read], [all-options.json][db-opts]                      |
| Remember view           | Graph, sankey | Saves center and zoom           | ECharts only               | [view-state unit][graph-view]                                                                                                                                                                                                                                                                                                                                                                                                  | None. The option changes later interactions.                                  |
| Highlight adjacency     | All           | `emphasis.focus`                | ECharts only               | [graph option unit][graph-opts], [sankey option unit][sankey-opts], [chord option unit][chord-opts]                                                                                                                                                                                                                                                                                                                            | [chord.json][db-chord]                                                        |
| Link color              | All           | Source, target, or gradient     | ECharts only               | [canvas: link color by endpoint (each line takes one end's colour)][canvas-graph], [canvas: gradient link color on a fixed layout (each line blends its source colour into its target)][canvas-graph], [integration: a gradient link colour is emitted only where the layout knows the positions][int-layout], [graph option unit][graph-opts]                                                                                 | [readability.json][db-read], [all-options.json][db-opts]                      |
| Edge arrows             | Graph         | Target arrowhead                | ECharts only               | [canvas: arrows off (plain lines, no heads)][canvas-graph], [graph option unit][graph-opts]                                                                                                                                                                                                                                                                                                                                    | [readability.json][db-read], [all-options.json][db-opts]                      |
| Show edge values        | Graph, sankey | Edge label                      | ECharts only               | [canvas: edge values on (a weight drawn at each link's midpoint)][canvas-graph], [canvas: edge values on (a weight drawn on each ribbon)][canvas-sankey], [edge-label unit][graph-labels]                                                                                                                                                                                                                                      | [readability.json][db-read], [all-options.json][db-opts]                      |
| Flow direction          | Sankey        | `series.sankey.orient`          | No core sankey             | [canvas: vertical flow (bars in rows, each label below its bar)][canvas-sankey], [canvas: long names on a vertical flow (each truncated, none over the next bar)][canvas-sankey], [sankey option unit][sankey-opts]                                                                                                                                                                                                            | [sankey.json][db-sankey], [all-options.json][db-opts]                         |
| Node alignment          | Sankey        | `series.sankey.nodeAlign`       | No core sankey             | [sankey option unit][sankey-opts]                                                                                                                                                                                                                                                                                                                                                                                              | [sankey.json][db-sankey], [all-options.json][db-opts]                         |

The graph layout choices differ from core. Both support force. Core adds layered and grid. Relations adds circular and fixed.

Zoom uses panel buttons, not the mouse wheel. This keeps dashboard scrolling available.

Show node values is hidden when no node has a measured value. The time slider is hidden on instant data unless it is already enabled.

## Advanced options

| Option            | Variants            | ECharts behavior        | Test                                                                                                                                                                                                                         | Dashboard                                                |
| ----------------- | ------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Label width       | All                 | `label.width`           | [integration: a long name is cut at the label width and ends in an ellipsis][int-labels], [integration: break mode wraps a long name over several lines instead of cutting it][int-labels], [label-style unit][graph-labels] | [readability.json][db-read], [all-options.json][db-opts] |
| Draggable nodes   | Fixed graph, sankey | Saves node position     | [graph option unit][graph-opts], [sankey option unit][sankey-opts]                                                                                                                                                           | [all-options.json][db-opts]                              |
| Repulsion         | Force graph         | `force.repulsion`       | [integration: two renders of the same frames draw identical calls][int-layout], [force unit][graph-layout]                                                                                                                   | [readability.json][db-read], [all-options.json][db-opts] |
| Edge length       | Force graph         | `force.edgeLength`      | [force unit][graph-layout]                                                                                                                                                                                                   | [readability.json][db-read], [all-options.json][db-opts] |
| Gravity           | Force graph         | `force.gravity`         | [force unit][graph-layout]                                                                                                                                                                                                   | [readability.json][db-read], [all-options.json][db-opts] |
| Animate layout    | Force graph         | `force.layoutAnimation` | [force unit][graph-layout]                                                                                                                                                                                                   | [readability.json][db-read]                              |
| Animation         | Sankey, chord       | Root ECharts animation  | [option-surface unit][rel-surface]                                                                                                                                                                                           | [readability.json][db-read]                              |
| Link curveness    | Graph               | `lineStyle.curveness`   | [canvas: curveness 0.3 (links bowed away from the straight line)][canvas-graph], [graph option unit][graph-opts]                                                                                                             | [all-options.json][db-opts]                              |
| Node width        | Sankey              | `nodeWidth`             | [canvas: node width 32 and gap 20 (wider bars, further apart)][canvas-sankey], [sankey option unit][sankey-opts]                                                                                                             | [sankey.json][db-sankey], [all-options.json][db-opts]    |
| Node gap          | Sankey              | `nodeGap`               | [canvas: node width 32 and gap 20 (wider bars, further apart)][canvas-sankey], [sankey option unit][sankey-opts]                                                                                                             | [sankey.json][db-sankey], [all-options.json][db-opts]    |
| Ribbon curveness  | Sankey              | `lineStyle.curveness`   | [sankey option unit][sankey-opts]                                                                                                                                                                                            | [all-options.json][db-opts]                              |
| Ribbon opacity    | Sankey              | `lineStyle.opacity`     | [canvas: ribbon opacity 0.7 (ribbons nearly solid over the background)][canvas-sankey], [sankey option unit][sankey-opts]                                                                                                    | [sankey.json][db-sankey], [all-options.json][db-opts]    |
| Layout iterations | Sankey              | `layoutIterations`      | [sankey option unit][sankey-opts]                                                                                                                                                                                            | [all-options.json][db-opts]                              |
| Start angle       | Chord               | `startAngle`            | [canvas: start angle 0 and counter-clockwise (the ring rotated and reversed)][canvas-chord], [chord option unit][chord-opts]                                                                                                 | [chord.json][db-chord], [all-options.json][db-opts]      |
| Clockwise         | Chord               | `clockwise`             | [canvas: start angle 0 and counter-clockwise (the ring rotated and reversed)][canvas-chord], [chord option unit][chord-opts]                                                                                                 | [chord.json][db-chord], [all-options.json][db-opts]      |
| Arc gap           | Chord               | `padAngle`              | [canvas: pad angle 12 (wide gaps between arcs)][canvas-chord], [chord option unit][chord-opts]                                                                                                                               | [chord.json][db-chord], [all-options.json][db-opts]      |
| Minimum arc angle | Chord               | `minAngle`              | [chord option unit][chord-opts]                                                                                                                                                                                              | [chord.json][db-chord], [all-options.json][db-opts]      |
| Ribbon opacity    | Chord               | `lineStyle.opacity`     | [chord option unit][chord-opts]                                                                                                                                                                                              | [chord.json][db-chord], [all-options.json][db-opts]      |
| Editor mode       | All                 | Shows advanced controls | [tier unit][rel-tier]                                                                                                                                                                                                        | None. This control changes the editor only.              |

ECharts ignores the root animation option for graph. Graph uses Animate layout for force simulation steps.

Chord has no view coordinate system. It does not support zoom, pan, drag, or edge labels.

Sankey labels move below nodes in vertical flow. This avoids labels that overlap the next node.

## Field configuration

One node or edge is one field. A `byName` override can target one mark.

| Option                          | Support       | Notes                             | Test                                                                                                                                                                                                                   | Dashboard                                                                        |
| ------------------------------- | ------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Color                           | Yes           | All field color modes             | [canvas: a color field per node (blue, green, yellow and red symbols)][canvas-graph], [canvas: a byName color override (DB drawn red, the other three on the palette)][canvas-overrides], [conversion unit][wide-conv] | [graph-wide.json][db-wide], [all-options.json][db-opts]                          |
| Unit                            | Yes           | Per mark                          | [tooltip model unit][tip-model], [emitted tooltip model][tip-emit]                                                                                                                                                     | [per-mark-tooltip-links.json][db-marks], [graph-wide.json][db-wide]              |
| Decimals                        | Yes           | Per mark                          | [tooltip model unit][tip-model]                                                                                                                                                                                        | [per-mark-tooltip-links.json][db-marks]                                          |
| Value mappings                  | Yes           | Labels, tooltips, and color       | [value-mapping unit][mappings]                                                                                                                                                                                         | [value-mappings.json][db-value-mappings], [all-options.json][db-opts]            |
| Thresholds                      | Yes           | Color                             | [color resolver unit][perf-res]                                                                                                                                                                                        | [colour-domain.json][db-colour-domain], [all-options.json][db-opts]              |
| Min and max                     | Yes           | Color range                       | [color resolver unit][perf-res]                                                                                                                                                                                        | [colour-domain.json][db-colour-domain]                                           |
| Field min/max                   | Yes           | Color range                       | [color resolver unit][perf-res]                                                                                                                                                                                        | [colour-domain.json][db-colour-domain]                                           |
| Display name                    | Override only | Renames one node                  | [wide conversion unit][wide-conv], [derived-node integration][int-derived]                                                                                                                                             | [graph-wide.json][db-wide]                                                       |
| Data links                      | Yes           | Tooltip footer                    | [data-link footer test][dl-test]                                                                                                                                                                                       | [per-mark-tooltip-links.json][db-marks], [graph-wide.json][db-wide]              |
| Filterable                      | Yes           | Ad hoc filters                    | [filter button test][filters-test], [tooltip overlay test][tip-overlay], [tooltip filter unit][tip-filters]                                                                                                            | [devcortex-wide.json][db-devcortex], [per-mark-tooltip-links.json][db-marks]     |
| Hide from visualization         | Yes           | Hides a mark                      | [legend unit][use-legend], [override canvas][canvas-overrides]                                                                                                                                                         | [node-graph-testdata.json][db-testdata]                                          |
| Actions                         | No            | No action surface                 | None                                                                                                                                                                                                                   | None                                                                             |
| No value                        | No            | Null marks omit the value         | [optional-field unit][ng-conv]                                                                                                                                                                                         | None                                                                             |
| Node radius                     | Override only | Graph                             | [graph canvas][canvas-graph], [conversion unit][wide-conv]                                                                                                                                                             | [graph-wide.json][db-wide], [devcortex-wide.json][db-devcortex]                  |
| Subtitle                        | Override only | Tooltip                           | [tooltip model unit][tip-model], [conversion unit][ng-conv]                                                                                                                                                            | [per-mark-tooltip-links.json][db-marks], [node-graph-testdata.json][db-testdata] |
| Fixed x and y                   | Override only | Fixed graph or sankey position    | [canvas: fixed coordinates from the data (nodes at the server's x and y, not on a ring)][canvas-graph], [layout unit][graph-layout]                                                                                    | [node-graph-testdata.json][db-testdata], [all-options.json][db-opts]             |
| Line width and type             | Override only | Graph                             | [graph canvas][canvas-graph], [conversion unit][wide-conv]                                                                                                                                                             | [node-graph-testdata.json][db-testdata]                                          |
| Curveness                       | Override only | Graph                             | [override canvas][canvas-overrides], [graph option unit][graph-opts]                                                                                                                                                   | [all-options.json][db-opts]                                                      |
| Source and target filter labels | Deprecated    | Keep original labels in the query | [tooltip mark unit][tip-marks], [filter button test][filters-test], [derived conversion unit][derived-conv]                                                                                                            | [devcortex-wide.json][db-devcortex]                                              |

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
| [#37 opts][live-opt-37] | Chart type: Chord            | [#40 opts][live-opt-40] | Link color: Gradient on Sankey |
| [#38 opts][live-opt-38] | Label overflow: Wrap         | [#41 opts][live-opt-41] | Show edge values: Sankey       |
| [#39 opts][live-opt-39] | Link color: Source           | [#42 opts][live-opt-42] | Highlight adjacency: Off       |
| [#43 opts][live-opt-43] | Node alignment: Left         | [#44 opts][live-opt-44] | Node alignment: Right          |

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
[canvas-overrides]: ../../lib/components/canvas-tests/relations/overrides.canvas.test.tsx
[int-labels]: ../../lib/components/integration-tests/relations/labels.integration.test.tsx
[int-layout]: ../../lib/components/integration-tests/relations/layout.integration.test.tsx
[int-interaction]: ../../lib/components/integration-tests/relations/interaction.integration.test.tsx
[int-derived]: ../../lib/components/integration-tests/relations/derived-nodes.integration.test.tsx
[int-timeline]: ../../lib/components/integration-tests/relations/timeline.integration.test.tsx
[canvas-timeline]: ../../lib/components/canvas-tests/relations/timeline.canvas.test.tsx
[ed-timeline]: ../../lib/grafana/editor/relations/timeline.test.ts
[graph-opts]: ../../lib/echarts/relations/options/graph.test.ts
[graph-layout]: ../../lib/echarts/relations/options/layout.test.ts
[graph-labels]: ../../lib/echarts/relations/options/labels.test.ts
[graph-view]: ../../lib/echarts/relations/options/view.test.ts
[sankey-opts]: ../../lib/echarts/relations/options/sankey.test.ts
[chord-opts]: ../../lib/echarts/relations/options/chord.test.ts
[rel-chart]: ../../lib/echarts/relations/chartModule.test.ts
[ng-conv]: ../../lib/echarts/relations/converters/graphWide.test.ts
[time-stops]: ../../lib/echarts/relations/converters/timeStops.test.ts
[wide-conv]: ../../lib/echarts/relations/converters/graphWide.test.ts
[use-legend]: ../../lib/components/hooks/useLegend.test.tsx
[tip-marks]: ../../lib/echarts/relations/tooltip/marks.test.ts
[tip-model]: ../../lib/echarts/relations/tooltip/model.test.ts
[tip-filters]: ../../lib/echarts/relations/tooltip/filters.test.ts
[mappings]: ../../lib/echarts/relations/tooltip/valueMappings.test.ts
[tip-emit]: ../../lib/echarts/tooltip/tooltipEmit.test.ts
[dl-test]: ../../lib/components/tooltip/dataLinks.test.tsx
[tip-overlay]: ../../lib/components/tooltip/EChartsTooltip.test.tsx
[filters-test]: ../../lib/components/tooltip/adHocFilters.test.tsx
[derived-conv]: ../../lib/echarts/relations/converters/deriveNodes.test.ts
[perf-res]: ../../lib/echarts/performance/resolvers.test.ts
[rel-surface]: ../../lib/grafana/editor/relations/optionSurface.test.ts
[rel-tier]: ../../lib/grafana/editor/relations/advancedTier.test.ts
[derived]: ../../../docs/relations-derived-nodes.md
[db-wide]: ../../../provisioning/dashboards/relations/graph-wide.json
[db-colour-domain]: ../../../provisioning/dashboards/relations/colour-domain.json
[db-value-mappings]: ../../../provisioning/dashboards/relations/value-mappings.json
[db-devcortex]: ../../../provisioning/dashboards/relations/devcortex-wide.json
[db-testdata]: ../../../provisioning/dashboards/relations/node-graph-testdata.json
[db-marks]: ../../../provisioning/dashboards/relations/per-mark-tooltip-links.json
[db-sankey]: ../../../provisioning/dashboards/relations/sankey.json
[db-read]: ../../../provisioning/dashboards/relations/readability.json
[db-opts]: ../../../provisioning/dashboards/relations/all-options.json
[db-timeline]: ../../../provisioning/dashboards/relations/timeline.json
[db-chord]: ../../../provisioning/dashboards/relations/chord.json
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
[live-opt-37]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=37
[live-opt-38]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=38
[live-opt-39]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=39
[live-opt-40]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=40
[live-opt-41]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=41
[live-opt-42]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=42
[live-opt-43]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=43
[live-opt-44]: http://localhost:3001/d/echarts-relations-all-options?viewPanel=44
