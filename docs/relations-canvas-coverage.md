# Relations render coverage

This guide shows which relations options have render tests. It covers graph, sankey, and chord.

The last audit was 2026-09-12. It used `src/lib/grafana/editor/relations/*` and `src/editor/relations/types.ts`.

## Marks

| Mark | Meaning                                             |
| ---- | --------------------------------------------------- |
| ■    | A canvas snapshot pins the output.                  |
| ▫    | An integration test pins a drawn value or relation. |
| ·    | No render test pins the output.                     |
| n/a  | The option does not change one static render.       |

`Default` means that a base render pins the default value. `Changed` means that a test pins a non-default value.

Canvas tests set these values for stable output:

- `relationsLayout: 'circular'`
- `animation.enabled: false`
- `editorMode: 'advanced'`

## Panel options

| Option                           | Default value | Base render             | Changed render                           |
| -------------------------------- | ------------- | ----------------------- | ---------------------------------------- |
| `relationsShowNodeLabels`        | `true`        | ■ all base renders      | ■ graph, sankey, and chord labels off    |
| `relationsShowNodeValues`        | `false`       | ■ all base renders      | ■ graph and timeline                     |
| `relationsHideOverlappingLabels` | `true`        | ■ all base renders      | ■ graph and sankey, ▫ labels integration |
| `relationsNodeSize`              | `20`          | ■ all base renders      | ■ graph node size 40                     |
| `relationsLayout`                | `force`       | · harness uses circular | ■ circular and fixed, ▫ force            |
| `relationsFocusAdjacency`        | `true`        | ■ base without hover    | · needs a browser hover                  |
| `relationsSankeyOrient`          | `horizontal`  | ■ sankey base           | ■ vertical flow                          |
| `relationsSankeyNodeAlign`       | `left`        | ■ sankey base           | ▫ left and justify differ                |
| `relationsTimeSlider`            | `false`       | ■ all base renders      | ■ timeline                               |
| `reduceOptions.calcs`            | `median`      | ▫ values integration    | ▫ max and extra calculations             |
| `relationsLabelOverflow`         | `truncate`    | ■ all base renders      | ■ break, ▫ truncate                      |
| `relationsEdgeArrows`            | `true`        | ■ graph base            | ■ arrows off                             |
| `relationsLinkColor`             | `gradient`    | ■ graph base            | ■ source, target, and gradient           |
| `relationsShowEdgeValues`        | `false`       | ■ all base renders      | ■ graph, sankey, and timeline            |
| `relationsZoom` / `relationsPan` | `false`       | ■ all base renders      | ▫ roam action and labels                 |
| `relationsRememberView`          | `false`       | ■ all base renders      | n/a                                      |

## Advanced options

| Option                            | Default value | Base render        | Changed render   |
| --------------------------------- | ------------- | ------------------ | ---------------- |
| `relationsCurveness`              | `0`           | ■ graph base       | ■ graph 0.3      |
| `relationsLabelWidth`             | `120`         | ■ all base renders | ■ graph 60       |
| `relationsSankeyNodeWidth`        | `20`          | ■ sankey base      | ■ width 32       |
| `relationsSankeyNodeGap`          | `8`           | ■ sankey base      | ■ gap 20         |
| `relationsSankeyCurveness`        | `0.5`         | ■ sankey base      | ■ 0              |
| `relationsSankeyLinkOpacity`      | `0.2`         | ■ sankey base      | ■ 0.7            |
| `relationsSankeyLayoutIterations` | `32`          | ■ sankey base      | · unit test only |
| `relationsChordStartAngle`        | `90`          | ■ chord base       | ■ 0              |
| `relationsChordClockwise`         | `true`        | ■ chord base       | ■ false          |
| `relationsChordPadAngle`          | `3`           | ■ chord base       | ■ 12             |
| `relationsChordMinAngle`          | `0`           | ■ chord base       | ■ 30             |
| `relationsChordLinkOpacity`       | `0.2`         | ■ chord base       | · unit test only |
| `relationsDraggable`              | `false`       | ■ all base renders | n/a              |
| `relationsRepulsion`              | `400`         | ·                  | ·                |
| `relationsEdgeLength`             | `200`         | ·                  | ·                |
| `relationsGravity`                | unset         | ·                  | ·                |
| `relationsLayoutAnimation`        | `false`       | ·                  | ·                |
| `animation.enabled`               | `false`       | n/a                | n/a              |

ECharts ignores `animation.enabled` for graph. Graph uses `relationsLayoutAnimation` for force layout steps. Sankey and chord use `animation.enabled`.

## Field configuration

`Changed` means that an override targets one mark.

| Property                                         | Default              | Changed                           |
| ------------------------------------------------ | -------------------- | --------------------------------- |
| `custom.nodeRadius`                              | ■ all base renders   | ■ graph and derived node override |
| `custom.fixedX` / `fixedY`                       | ■ all base renders   | ■ fixed graph                     |
| `custom.lineWidth` / `lineType`                  | ■ graph base         | ■ graph edge styles               |
| `custom.curveness`                               | ■ graph base         | ■ edge override                   |
| `custom.hideFrom`                                | ■ all base renders   | ■ node and edge overrides         |
| `color`                                          | ■ classic palette    | ■ fixed and field colors          |
| `thresholds`                                     | ■ all base renders   | ■ absolute, · percentage          |
| `displayName`                                    | ■ all base renders   | ■ derived node override           |
| `unit` / `decimals`                              | ▫ values integration | ▫ defaults and overrides          |
| `custom.subtitle`                                | n/a                  | n/a                               |
| `custom.icon`                                    | n/a                  | n/a                               |
| `custom.sourceFilterLabel` / `targetFilterLabel` | n/a                  | n/a                               |
| `links`                                          | n/a                  | n/a                               |

Canvas tests must register every override property in `src/test/fieldConfig.ts`. An unregistered property does not change the render.

## Color schemes

Each row uses one example on graph, sankey, and chord.

| Class               | Mode                        | Coverage |
| ------------------- | --------------------------- | -------- |
| Classic palette     | `palette-classic`           | ■        |
| Fixed color         | `fixed`                     | ■        |
| Shades              | `shades`                    | ■        |
| Threshold bands     | `thresholds`                | ■        |
| Continuous scale    | `continuous-*`              | ■        |
| Color-blind palette | `palette-colorblind`        | ■        |
| Categorical palette | `palette-categorical-next*` | ·        |

The categorical palette needs Grafana 13.3. The current `@grafana/data` version is 13.1.1, so a snapshot will pin fallback gray instead.

Palette modes let `relationsLinkColor` choose the edge color. Other modes use the edge field color.

## Gaps

Force layout coordinates depend on simulation timing. Unit tests pin its options, and `layout.integration.test.tsx` pins repeatable output.

Adjacency emphasis needs a browser hover. Canvas events do not update the ECharts hover state in this test environment.

Drag and remembered view describe gestures. A static render cannot prove them.

Graph pins the shared node value formatter. Sankey and chord use the same formatter.

## Test locations

Canvas tests live in `src/lib/components/canvas-tests/relations/`. Integration tests live in `src/lib/components/integration-tests/relations/`.

A `*.canvas.test.*` file contains canvas snapshots only. Every test must call `toMatchCanvasSnapshot`. Use `*.integration.test.*` for drawn values and render comparisons.

Review canvas changes as images. Do not review the draw-call JSON.
