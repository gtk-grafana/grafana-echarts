import {
  type FieldConfigSource,
  FieldColorModeId,
  FieldType,
  ThresholdsMode,
  toDataFrame,
  type ThresholdsConfig,
} from '@grafana/data';
import { normalizeCanvasEvents } from 'test/canvas';
import { height, width } from 'test/panel';
import { renderRelations, type RelationsVariant } from 'test/relationsCanvas';

/**
 * Canvas snapshots for the **classes of colour scheme**, across all three relations
 * variants. Every test here is a snapshot test.
 *
 * A relations mark takes its colour from its own display processor
 * (`colorOf` — `field.display(value).color`), so every scheme Grafana offers arrives
 * already resolved and the family writes no resolver of its own. That is exactly why the
 * classes need pinning rather than the individual schemes: what can break is a *class*
 * losing its route, not `continuous-BlPu` differing from `continuous-YlRd`. One
 * representative per class:
 *
 * | Class                | Mode                     | What the picture should show               |
 * | -------------------- | ------------------------ | ------------------------------------------ |
 * | single colour        | `fixed`                  | every mark the same red                    |
 * | shades of a colour   | `shades`                 | one hue, a step per mark                   |
 * | by value, banded     | `thresholds`             | green / orange / red by the mark's own stat |
 * | by value, graded     | `continuous-GrYlRd`      | a ramp across the same stats               |
 * | palette, colour-blind| `palette-colorblind`     | one palette slot per mark                  |
 *
 * **The classic palette is not here**: it is the default, so all three `base` pictures in
 * the sibling suites already pin it — see `docs/relations-canvas-coverage.md`.
 *
 * **Edges are the half that differs between the classes.** A palette is not a colour
 * decision an edge can read — a series index says nothing about which two nodes it joins
 * — so under `palette-colorblind` every edge falls through to "Link color", while under
 * the other four it takes its own weight's colour. `isPaletteColorMode` is the rule, and
 * the fall-through is what each variant does with it: sankey writes a real canvas
 * gradient between its bars (the only `createLinearGradient` in these fifteen
 * baselines), the graph paints a solid endpoint colour — a blended line there needs a
 * fixed layout, see `relations-graph.canvas` "gradient link color" — and chord takes each
 * ribbon from its arcs.
 *
 * The scheme is applied as a **`byType` override** rather than as `fieldConfig.defaults`,
 * which cannot work in this harness: `test/fieldConfig.ts` stamps `palette-classic` on
 * every field before `applyFieldOverrides` runs, so a default colour would never win. An
 * override reaches every numeric field the same way the pane's own "Color scheme" does.
 */

/** Green under 40, orange from 40, red from 70 — one band per mark in the fixture. */
const thresholds: ThresholdsConfig = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { value: -Infinity, color: 'green' },
    { value: 40, color: 'orange' },
    { value: 70, color: 'red' },
  ],
};

/**
 * Three nodes and two edges, deliberately smaller than the sibling suites' four-node
 * diamond: a colour scheme needs only enough marks to tell its steps apart, and every
 * mark saved is ~300 lines off fifteen baselines.
 *
 * Stats are spread across the threshold bands (10 / 50 / 90 and 20 / 80) so the banded
 * and graded classes have something to grade. `thresholds` rides on every field because
 * only the `thresholds` mode reads it — the other four ignore it.
 */
const colorNodes = toDataFrame({
  name: 'nodes',
  fields: [
    { name: 'id', type: FieldType.string, values: ['a', 'b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [10, 50, 90], config: { thresholds } },
  ],
});

const colorEdges = toDataFrame({
  name: 'edges',
  fields: [
    { name: 'id', type: FieldType.string, values: ['e1', 'e2'] },
    { name: 'source', type: FieldType.string, values: ['a', 'b'] },
    { name: 'target', type: FieldType.string, values: ['b', 'c'] },
    { name: 'mainstat', type: FieldType.number, values: [20, 80], config: { thresholds } },
  ],
});

/** The scheme, addressed to every numeric field — nodes and edges alike. */
const withScheme = (color: FieldConfigSource['defaults']['color']): FieldConfigSource => ({
  defaults: {},
  overrides: [
    {
      matcher: { id: 'byType', options: 'number' },
      properties: [{ id: 'color', value: color }],
    },
  ],
});

const schemes = [
  { name: 'single color (every mark the same red)', color: { mode: FieldColorModeId.Fixed, fixedColor: 'red' } },
  {
    name: 'shades of a color (one hue, a step per mark)',
    color: { mode: FieldColorModeId.Shades, fixedColor: 'blue' },
  },
  { name: 'by value, banded (each mark in its threshold band)', color: { mode: FieldColorModeId.Thresholds } },
  {
    name: 'by value, graded (a continuous ramp over the same stats)',
    color: { mode: FieldColorModeId.ContinuousGrYlRd },
  },
  {
    name: 'color blind safe palette (a slot per mark, gradient edges)',
    color: { mode: FieldColorModeId.PaletteColorblind },
  },
];

const variants: RelationsVariant[] = ['graph', 'sankey', 'chord'];

describe.each(variants)('relations color (%s)', (variant) => {
  it.each(schemes)('$name', async ({ color }) => {
    const { defaultEvents, seriesEvents } = await renderRelations({
      frames: [colorNodes, colorEdges],
      variant,
      fieldConfig: withScheme(color),
    });

    expect(normalizeCanvasEvents(seriesEvents)).toMatchCanvasSnapshot(defaultEvents, { width, height });
  });
});
