import { type DataFrame, type FieldConfigSource } from '@grafana/data';
import { render } from '@testing-library/react';
import { type CanvasRenderingContext2DEvent } from 'jest-canvas-mock';
import { deriveNodes } from 'lib/echarts/converters/deriveNodes';
import { legacyToWide } from 'lib/echarts/converters/legacyToWide';
import { SERIES_ZLEVEL } from 'test/canvas';
import { getComponent, getSeriesCanvasEvents } from 'test/panel';
import { type PanelOptions } from 'types';

/**
 * Render harness shared by the relations canvas and integration suites.
 *
 * The graph series is axis-less — it creates its own `View` coordinate system and
 * paints nothing on the default grid layer — so only the series layer is read, via
 * the tolerant `getSeriesCanvasEvents` (like pie/funnel/hierarchy).
 *
 * **Most layouts are pinned deliberately.** `layout: 'circular'` (deterministic ring
 * placement) or `none` with `fixedx`/`fixedy` from the data keeps a snapshot readable
 * as "these nodes, these links" rather than as an artefact of the simulation. The force
 * layout is reproducible too — `relations-layout.integration.test.tsx` is the test for
 * that — but its coordinates carry no meaning, so it is not snapshotted.
 *
 * Rendered in Advanced editor mode so the advanced options these suites exercise (edge
 * arrows, curveness, link color, edge values) are respected as-is; in Default mode
 * `applyEditorModeDefaults` resets every advanced option. `animation: { enabled: false }`
 * is explicit because the relations family defaults it *on*, and a snapshot taken
 * mid-animation is not a snapshot of anything.
 *
 * Fixtures live in `test/relations.ts`, so the unit suites describe the same graph.
 */

export type RelationsVariant = 'graph' | 'sankey' | 'chord';

/** The pipeline prefix a fixture is put through before it reaches the panel. */
export type PipelinePrefix = (frames: DataFrame[]) => DataFrame[];

/**
 * Fixtures are written in Grafana's row form, because that is what a datasource emits,
 * and converted the way the host does: by the transformations the plugin registers on
 * itself, which run above the panel (`modules/relations/dataTransformations.ts`). The
 * panel itself reads only the field-based contract, so every render here goes through
 * the same conversion the real pipeline performs.
 *
 * **Both halves of the prefix, in the host's order.** `legacyToWide` reshapes, then
 * `deriveNodes` declares any node the response only implied — which for an edges-only
 * fixture is all of them. Adding the second half changed no snapshot, which is the
 * guarantee it is built around: the pre-pass adds configurability, not marks, so a
 * dashboard looks the same on a host that cannot run it.
 */
export const asPipelineWould: PipelinePrefix = (frames) => deriveNodes(legacyToWide(frames));

export const canvasOptions = (extra: Partial<PanelOptions> = {}): Partial<PanelOptions> => ({
  zLevel: { series: SERIES_ZLEVEL },
  animation: { enabled: false },
  editorMode: 'advanced',
  relationsLayout: 'circular',
  ...extra,
});

interface RenderRelationsInput {
  frames: DataFrame[];
  /** Defaults to `graph`. Sankey and chord self-layout, so both drop `relationsLayout`. */
  variant?: RelationsVariant;
  options?: Partial<PanelOptions>;
  fieldConfig?: FieldConfigSource;
  /**
   * The pipeline prefix to run the fixture through. Only the derived-node cases pass
   * one: they compare a render against the same render with the *other* prefix, which
   * is how "the pre-pass changes nothing visible" and "the override is inert without
   * it" are stated as claims rather than as two snapshot files.
   */
  prefix?: PipelinePrefix;
}

/**
 * Render one variant of the relations panel and return its settled series-layer draw
 * calls (plus the default layer, which the compare viewer uses as context).
 *
 * `relationsLayout` is a graph-only option: sankey self-layouts into columns from the
 * link weights and chord into a ring, both with no physics simulation, so their
 * geometry is already deterministic and the key is dropped for them.
 */
export const renderRelations = async ({
  frames,
  variant = 'graph',
  options = {},
  fieldConfig,
  prefix = asPipelineWould,
}: RenderRelationsInput) => {
  const merged = canvasOptions(options);
  const { container } = render(
    getComponent(
      prefix(frames),
      variant,
      variant === 'graph' ? merged : { ...merged, relationsLayout: undefined },
      undefined,
      undefined,
      'relations',
      fieldConfig
    )
  );
  return getSeriesCanvasEvents(container);
};

/**
 * The text of every label actually painted, so a label test can assert what was drawn
 * rather than only pin it. Draw calls accumulate across the harness's two render passes
 * (see todo/canvas-snapshot-double-render.md), so the same label appears twice.
 */
export const labelTexts = (events: CanvasRenderingContext2DEvent[]): string[] =>
  events.filter((event) => event.type === 'fillText').map((event) => String(event.props.text));

/**
 * The distinct labels painted, sorted — the double render collapses away, so this is
 * what an inline snapshot of "which labels survived" is written against.
 */
export const uniqueLabelTexts = (events: CanvasRenderingContext2DEvent[]): string[] =>
  [...new Set(labelTexts(events))].sort();

/** Every label drawn since `from`, in canvas coordinates. */
export const labelPositions = (events: CanvasRenderingContext2DEvent[], from = 0) =>
  events.slice(from).flatMap((event) => {
    if (event.type !== 'fillText') {
      return [];
    }
    const { text, x, y } = event.props as unknown as { text: string; x: number; y: number };
    // zrender writes the element's transform as canvas state and the label's own offset
    // as the draw call's arguments, so where a label actually landed is one applied to
    // the other. The transform each call was made under is what `jest-canvas-mock`
    // records alongside it.
    const [a, b, c, d, e, f] = (event as unknown as { transform: number[] }).transform;
    return [{ text: String(text), x: a * x + c * y + e, y: b * x + d * y + f }];
  });
