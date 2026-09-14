# Relations canvas coverage

Which relations settings are pinned by a rendered test, and which are not. One row per
panel option or field-config property, because the question a reviewer actually has is
"if I break this option, does something fail?".

Audited 2026-09-12 against `src/lib/grafana/editor/relations/*` (every option the pane
offers) and `src/editor/types.ts` (`EChartsRelationsFieldConfig`).

## How to read it

| Mark | Meaning                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| ■    | Pinned by a **canvas baseline** — a committed picture, reviewed as an image            |
| ▫    | Pinned by a **drawn-primitive assertion** — `fillText` / alpha / position, no baseline |
| ·    | **Not pinned by any render.** May still have unit coverage of the option it emits      |
| —    | Nothing to draw: the setting changes no canvas output                                  |

Two columns, because both halves break independently:

- **Default** — is the option's _default_ rendering pinned? Almost always by a variant's
  `base` picture, which renders with everything unset.
- **Changed** — is a _non-default_ value pinned? This is the half that catches "the
  option stopped being read".

Suites are named without their `.test.tsx` suffix and their directory:
`graph.canvas` is `src/lib/components/canvas-tests/relations/graph.canvas.test.tsx`, and
`labels.integration` is
`src/lib/components/integration-tests/relations/labels.integration.test.tsx`.

Three settings the harness pins for every canvas test, so no baseline can cover their
alternatives (see `test/relationsCanvas.tsx`): `relationsLayout: 'circular'`,
`animation.enabled: false`, `editorMode: 'advanced'`.

## Default-tier options

| Option                           | Default        | Default                                     | Changed                                                                                                 |
| -------------------------------- | -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `relationsShowNodeLabels`        | `true`         | ■ every `base`                              | ■ `graph` / `sankey` / `chord.canvas` ("labels off")                                                    |
| `relationsShowNodeValues`        | `false`        | ■ every `base`                              | ■ `graph.canvas` "node values on", `timeline.canvas`                                                    |
| `relationsHideOverlappingLabels` | `true`         | ■ every `base`                              | ■ `graph` + `sankey.canvas` (`false` beside edge values), ▫ `labels.integration`                        |
| `relationsNodeSize`              | `20`           | ■ every `base`                              | ■ `graph.canvas` "node size 40"                                                                         |
| `relationsLayout`                | `'force'`      | · harness pins `circular`                   | ■ `circular` (every baseline), ■ `none` (`graph.canvas` fixed coords), ▫ `force` (`layout.integration`) |
| `relationsFocusAdjacency`        | `true`         | ■ every `base` (option on, nothing hovered) | · **gap** — see below                                                                                   |
| `relationsSankeyOrient`          | `'horizontal'` | ■ `sankey.canvas` base                      | ■ `sankey.canvas` "vertical flow"                                                                       |
| `relationsSankeyNodeAlign`       | `'justify'`    | ■ `sankey.canvas` base                      | ■ `sankey.canvas` "node align left"                                                                     |
| `relationsTimeSlider`            | `false`        | ■ every `base`                              | ■ `timeline.canvas` (both baselines)                                                                    |
| `reduceOptions.calcs`            | `lastNotNull`  | ▫ `values.integration`                      | ▫ `values.integration` (`max`, and a second calc ignored)                                               |
| `animation.enabled`              | `true`         | — forced off in tests                       | — a settled render is the same picture                                                                  |

## Advanced-tier options

| Option                            | Default      | Default                   | Changed                                                     |
| --------------------------------- | ------------ | ------------------------- | ----------------------------------------------------------- |
| `relationsEdgeArrows`             | `true`       | ■ `graph` base            | ■ `graph.canvas` "arrows off"                               |
| `relationsShowEdgeValues`         | `false`      | ■ every `base`            | ■ `graph` + `sankey.canvas`, ■ `timeline.canvas`            |
| `relationsCurveness`              | unset (0)    | ■ `graph` base            | ■ `graph.canvas` "curveness 0.3"                            |
| `relationsLinkColor`              | `'gradient'` | ■ `graph` base            | ■ `graph.canvas` `source` / `target` / gradient             |
| `relationsLabelOverflow`          | `'truncate'` | ■ every `base`            | ■ `graph.canvas` "break overflow", ▫ `labels.integration`   |
| `relationsLabelWidth`             | `120`        | ■ every `base`            | ■ `graph.canvas` "label width 60"                           |
| `relationsSankeyNodeWidth`        | `20`         | ■ `sankey` base           | ■ `sankey.canvas` "node width 32 and gap 20"                |
| `relationsSankeyNodeGap`          | `8`          | ■ `sankey` base           | ■ same baseline                                             |
| `relationsSankeyCurveness`        | `0.5`        | ■ `sankey` base           | ■ `sankey.canvas` "ribbon curveness 0"                      |
| `relationsSankeyLinkOpacity`      | `0.2`        | ■ `sankey` base           | ■ `sankey.canvas` "ribbon opacity 0.7"                      |
| `relationsSankeyLayoutIterations` | `32`         | ■ `sankey` base           | · low risk — one passthrough key, unit-covered              |
| `relationsChordStartAngle`        | `90`         | ■ `chord` base            | ■ `chord.canvas` "start angle 0"                            |
| `relationsChordClockwise`         | `true`       | ■ `chord` base            | ■ same baseline                                             |
| `relationsChordPadAngle`          | `3`          | ■ `chord` base            | ■ `chord.canvas` "pad angle 12"                             |
| `relationsChordMinAngle`          | `0`          | ■ `chord` base            | ■ `chord.canvas` "minimum arc angle 30"                     |
| `relationsChordLinkOpacity`       | `0.2`        | ■ `chord` base            | · low risk — one passthrough key, unit-covered              |
| `relationsZoom` / `relationsPan`  | `false`      | ■ every `base`            | ▫ `interaction.integration` (roam action, label attachment) |
| `relationsDraggable`              | `false`      | ■ every `base`            | · no render — a drag has no committed picture               |
| `relationsRememberView`           | `false`      | ■ every `base`            | · no render — covered by option + persistence unit tests    |
| `relationsRepulsion`              | `400`        | · force layout not pinned | · by design — see below                                     |
| `relationsEdgeLength`             | `200`        | · same                    | · same                                                      |
| `relationsGravity`                | unset        | · same                    | · same                                                      |
| `relationsLayoutAnimation`        | `false`      | · same                    | · same                                                      |

## Field config

Per-mark `custom.*` (`editor/relations/fieldConfig.ts`) and the standard properties the
family reads. "Changed" here means an **override** addressing one mark.

| Property                                         | Default                  | Changed                                                          |
| ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------- |
| `custom.nodeRadius`                              | ■ every `base`           | ■ `graph.canvas` per-node, ■ `overrides.canvas` derived node     |
| `custom.fixedX` / `fixedY`                       | ■ every `base`           | ■ `graph.canvas` "fixed coordinates from the data"               |
| `custom.lineWidth`                               | ■ `graph` base           | ■ `graph.canvas` "thickness and strokedasharray"                 |
| `custom.lineType`                                | ■ `graph` base           | ■ same baseline                                                  |
| `custom.curveness`                               | ■ `graph` base           | ■ `overrides.canvas` "byName curveness"                          |
| `custom.hideFrom`                                | ■ every `base`           | ■ `overrides.canvas` edge **and** node                           |
| `color` (palette / fixed)                        | ■ every `base` (palette) | ■ `overrides.canvas` byName fixed, ■ `graph.canvas` colour field |
| `thresholds` (absolute)                          | ■ every `base`           | ■ `graph.canvas` "by-value scheme on every mark"                 |
| `thresholds` (percentage)                        | ■ every `base`           | · gap, low risk — resolved upstream by `field.display`           |
| `displayName`                                    | ■ every `base`           | ■ `overrides.canvas` derived node ("Database")                   |
| `unit` / `decimals`                              | ▫ `values.integration`   | ▫ `values.integration` (defaults **and** byName)                 |
| `custom.subtitle`                                | —                        | — tooltip only                                                   |
| `custom.icon`                                    | —                        | — carried by the conversion, never rendered                      |
| `custom.sourceFilterLabel` / `targetFilterLabel` | —                        | — tooltip footer only                                            |
| `links` (data links)                             | —                        | — tooltip / e2e                                                  |

**Overrides only reach a render if the property is registered.** `applyFieldOverrides`
resolves each override id through a registry that is empty under jest, so
`test/fieldConfig.ts` registers an explicit allow-list. An override on an unregistered
property silently no-ops, and a test asserting it would pass against a render that
ignored it — so adding a case for a new property means adding it there first.

## Colour schemes

One representative per **class** of scheme, on all three variants
(`color.canvas` = `canvas-tests/relations/color.canvas.test.tsx`, 15 baselines on a
3-node fixture). What breaks is a class losing its route, not one continuous ramp
differing from another: every mark is coloured by its own display processor, so the
schemes arrive already resolved.

| Class                | Mode                        | graph                                                            | sankey           | chord            |
| -------------------- | --------------------------- | ---------------------------------------------------------------- | ---------------- | ---------------- |
| Classic palette      | `palette-classic`           | ■ `graph.canvas` base                                            | ■ base           | ■ base           |
| Single colour        | `fixed`                     | ■ `color.canvas`, ■ `overrides.canvas` byName                    | ■ `color.canvas` | ■ `color.canvas` |
| Shades of a colour   | `shades`                    | ■ `color.canvas`                                                 | ■                | ■                |
| By value, banded     | `thresholds`                | ■ `color.canvas`, ■ `graph.canvas` (with link-colour precedence) | ■                | ■                |
| By value, graded     | `continuous-*`              | ■ `color.canvas`                                                 | ■                | ■                |
| Colour-blind palette | `palette-colorblind`        | ■ `color.canvas`                                                 | ■                | ■                |
| Categorical (13.3)   | `palette-categorical-next*` | · see below                                                      | ·                | ·                |

The colour-blind row is also where the **edge** rule is visible: a palette says nothing
about which two nodes an edge joins, so the edge falls through to "Link color"
(`isPaletteColorMode`), and each variant honours that differently — sankey writes a real
canvas gradient, the graph paints a solid endpoint colour (a blended line needs a fixed
layout — `graph.canvas` "gradient link color"), chord takes each ribbon from its arcs.
Under the four non-palette classes every edge carries its own weight's colour instead.

**No baseline for the categorical palettes, deliberately.** `palette-categorical-next*`
ships in Grafana 13.3; this tree builds against `@grafana/data` 13.1.1, where
`getFieldColorMode` does not know the id, falls back, and paints every node the same
grey. A picture of that pins the dependency version rather than the panel and would flip
on the bump. The rule that matters is version-independent and unit-covered —
`graphWide.test.ts` runs `palette-categorical-next` and a deliberately invented
`palette-invented-upstream` through the edge fall-through. When the dependency reaches
13.3, the case is one line in `color.canvas`'s scheme table.

**A scheme cannot be set through `fieldConfig.defaults` in this harness.**
`test/fieldConfig.ts` stamps `palette-classic` on every field before
`applyFieldOverrides` runs, so a default colour never wins; `color.canvas` applies each
scheme as a `byType: number` override, which reaches nodes and edges alike.

## Deliberate gaps

- **The force layout** (`relationsRepulsion`, `relationsEdgeLength`, `relationsGravity`,
  `relationsLayoutAnimation`). Its coordinates come out of a physics simulation and carry
  no meaning, so a baseline of them pins an artefact; `layout.integration` asserts the
  reproducibility instead. Every canvas test therefore runs on `circular` or on pinned
  coordinates.
- **`relationsFocusAdjacency`'s blur.** The option is unit-covered
  (`getGraphEmphasis`), but the _rendered_ effect needs a hover, and under this harness
  neither `dispatchAction({ type: 'highlight', … })` (with or without `dataType: 'node'`)
  nor a synthetic `zr.handler.dispatch('mousemove')` produces any repaint or element
  state — measured, 0 draw calls and 0 `currentStates` either way. Reaching it wants a
  browser: `@grafana/plugin-e2e`, or the canvas-override probe in `AGENTS.md`. Until
  then, "non-adjacent marks fade on hover" is unproven anywhere.
- **`relationsDraggable`, `relationsRememberView`.** Both are about what a gesture does
  next, not what one render looks like.
- **Sankey/chord node values.** `getRelationsNodeLabelFormatter` is shared by all three
  variants and pinned on the graph; the other two would pin the same formatter twice.

## What a case costs

167 baselines hold 14.5k lines (1.06 MB), of which the relations family is 6.6k lines
(45%). One relations baseline averages **~110 lines** on the four-node fixtures and ~85 on
the three-node colour one. A picture is not the cheap option: prefer a drawn-primitive
assertion in an `*.integration.test.tsx` sibling whenever the claim is a string or a
number, and keep the baseline for geometry. `src/test/suiteShape.test.ts` enforces the
split — every test in a `*.canvas.test.*` file must assert `toMatchCanvasSnapshot`.

Two cases compare their render against the same frames at the default
(`expect(…).not.toEqual(…)`), because their fixture is easy to get wrong: `sankey`'s
`nodeAlign` draws a byte-identical picture on `nodesFrame` (whose four nodes have no
slack), and `chord`'s `minAngle` does the same on any fixture without a sliver. A
baseline that pins nothing looks exactly like a baseline that pins something.

## Where the suites live

Two directories, kept distinct because one kind commits pictures and the other does not:

```
src/lib/components/
  canvas-tests/
    relations/
      graph.canvas.test.tsx          + __snapshots__/graph.canvas.test.tsx.snap
      sankey.canvas.test.tsx
      chord.canvas.test.tsx
      overrides.canvas.test.tsx
      color.canvas.test.tsx
      timeline.canvas.test.tsx
  integration-tests/
    relations/
      labels.integration.test.tsx    derived-nodes.integration.test.tsx
      layout.integration.test.tsx    timeline.integration.test.tsx
      interaction.integration.test.tsx
      values.integration.test.tsx
```

`git log --stat` on a family stops scrolling past every other family's baselines, a
reviewer can point a diff tool at one directory, and the integration siblings — which
commit nothing and are read as code — stop sitting next to the `.snap` files.

The other families still sit beside the components and are the same operation, one commit
each: `cartesian/` (axis, categorical-cartesian, performance, Panel), `part-to-whole/`,
`multivariate/`, `stream/`. What to watch for:

- **`git mv` the `.snap` files with the tests**, in the same commit, or every baseline is
  written from scratch and the diff is noise instead of a rename. Jest resolves
  `__snapshots__` relative to the test file, so the pairing is mechanical.
- Baselines are keyed off `describe`/`it`, not the path, so renaming files changes no
  baseline content. `scripts/canvas-inventory.mjs` is how that gets verified — a pure
  rename leaves its output byte-identical.
- Suites import through the `src`-rooted aliases (`test/canvas`, `lib/echarts/…`), which
  jest resolves via `modulePaths: ['<rootDir>/src']`, so imports survive the move. Check
  for relative sibling imports first; `timeline.integration` had one.
- `src/modules/*/parity.md` link definitions name test paths and
  `src/test/parityCitations.test.ts` resolves each one, so a stale path fails the build.
  That is the one place the move cannot be silent, and the reason it is safe.
- `suiteShape.test.ts` globs `src/**/*.canvas.test.*`, and `scripts/canvas-shots.mjs` and
  the AGENTS.md review flow key off the payload directory rather than the test path, so
  none of them need touching.

## Cutting snapshot size further

Two levers are already applied, and each rewrote every baseline — so per `AGENTS.md`, do
any of what is below as its own commit, never as a side effect of feature work.

- `src/test/canvasSerializer.ts` stores one JSON object per line instead of
  `pretty-format`'s ~10. The format has to stay valid JSON, because the matcher parses the
  stored baseline back to build the compare viewer's "expected" side;
  `src/test/canvasSerializer.test.ts` parses every committed baseline to keep that true.
- The capture helpers in `src/test/panel.tsx` record one render pass rather than every
  paint a mount accumulates.

What is left:

- **Drop `props.path` from the asserted events — 30% of bytes, no lines.** Every `stroke`,
  `fill` and `clip` event embeds the path it draws, a verbatim copy of the `moveTo` /
  `lineTo` / `quadraticCurveTo` / `arc` events recorded immediately before it. The
  assertion loses nothing by dropping it, but the compare viewer draws shapes from
  `props.path` and the matcher snapshots and payloads the same array, so it needs a change
  in `jest-canvas-mock-compare` — see
  [todo/canvas-snapshot-props-path.md](../todo/canvas-snapshot-props-path.md).
- **Retire the baselines whose whole claim is one number** — an opacity, a width. The
  biggest suites are `graph.canvas` (2.5k lines over 18 baselines), `part-to-whole` (2.3k
  over 27), `axis` (1.7k over 22) and `Panel` (1.6k over 27); each such case converts to a
  drawn-primitive assertion without losing anything a reviewer looks at. A coverage
  decision per case, not a mechanical change.
