import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import { addAnimationOption } from 'lib/grafana/editor/common/animation';
import { addEditorModeOption } from 'lib/grafana/editor/common/editor-mode';
import { addCommonLegendAndTooltip } from 'lib/grafana/editor/common/legend-and-tooltip';
import { removeOption } from 'lib/grafana/editor/common/removeOption';
import { addRelationsChordOptions } from 'lib/grafana/editor/relations/chord';
import { addRelationsForceOptions } from 'lib/grafana/editor/relations/force';
import { addRelationsInteractionOptions } from 'lib/grafana/editor/relations/interaction';
import { addRelationsLabelOptions } from 'lib/grafana/editor/relations/labels';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { addRelationsLinkOptions } from 'lib/grafana/editor/relations/links';
import { addRelationsSankeyOptions } from 'lib/grafana/editor/relations/sankey';
import { addRelationsTimelineOptions } from 'lib/grafana/editor/relations/timeline';
import { type PanelOptions } from 'types';

import { relationsCategoryName, relationsSeriesTypeOptions } from 'editor/relations/constants';
import { isGraphVariant } from 'editor/relations/variants';
import { seriesTypePath } from 'editor/constants';
/**
 * **The shape of the options pane, pinned.**
 *
 * The family's options are registered by eleven suppliers, and the pane's *structure* —
 * which sections exist, in what order, and which controls land in each — is a product of
 * the order `module.tsx` calls them in and the category each one passes. No single file
 * states it, and none of the per-supplier suites can: each sees only its own options.
 *
 * So the thing this asserts is the thing that was actually wrong before the reorg and
 * that no test would have caught: options scattered across a "Relations" catch-all and
 * one 25-control "Advanced" bucket, with the editor-mode switch in a section Grafana
 * named after the plugin. A reorganisation that regresses is a reorganisation nobody
 * notices, because every individual option still registers fine.
 *
 * It is a **surface pin, not a proof of usefulness** — it cannot tell that an option is
 * read by the render path. Two known-inert controls were found by hand during the audit
 * (`tooltip.sort` / `tooltip.hideZeros`); what this guarantees is that the next one has
 * to be added deliberately, by editing an expectation, rather than appearing silently.
 */

/** See `labels.test.ts` for why `standardEditorsRegistry` has to be stubbed. */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'radio', 'number', 'slider', 'text', 'color', 'unit', 'stats-picker'].map((id) => ({
    id,
    name: id,
    editor: noEditor,
  }))
);

/**
 * `module.tsx`'s supplier order, reproduced.
 *
 * `addRelationsStatOptions` is the one omission: it calls `t()` at registration time,
 * which needs an initialised i18n the panel module sets up and a unit test has no reason
 * to. Its two options are covered by `stats.test`-adjacent suites and by the "Value"
 * section assertion below, which reads the timeline switch's category instead.
 */
const buildPane = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();

  if (relationsSeriesTypeOptions.length > 1) {
    builder.addRadio({
      path: seriesTypePath,
      name: 'Chart type',
      category: [relationsCategoryName],
      defaultValue: 'graph',
      settings: { options: relationsSeriesTypeOptions },
    });
  }
  addRelationsTimelineOptions(builder);
  addRelationsLabelOptions(builder);
  addRelationsLayoutOptions(builder);
  addRelationsForceOptions(builder);
  addAnimationOption(builder, { category: ['Layout'], showIf: (o) => !isGraphVariant(o) });
  addRelationsInteractionOptions(builder);
  addRelationsLinkOptions(builder);
  addRelationsSankeyOptions(builder);
  addRelationsChordOptions(builder);
  addCommonLegendAndTooltip(builder, { singleTooltipOnly: true, includeLegendCalcs: false });
  removeOption(builder, 'tooltip.sort');
  removeOption(builder, 'tooltip.hideZeros');
  addEditorModeOption(builder, [relationsCategoryName]);

  return builder.getItems();
};

/** Section order as the pane renders it: first registration wins. */
const sectionOrder = (items: ReturnType<typeof buildPane>) => [
  ...new Set(items.map((item) => item.category?.[0] ?? '<uncategorised>')),
];

const pathsIn = (items: ReturnType<typeof buildPane>, section: string) =>
  items.filter((item) => item.category?.[0] === section).map((item) => item.path);

describe('the relations options pane', () => {
  /**
   * Every option is in a named section. An option with no `category` is rendered by
   * Grafana under a section named after the **panel plugin** — which is how the family
   * came to have an "ECharts Relations" section containing one radio, sitting beside its
   * real "Relations" section. That is the regression this line prevents.
   */
  it('leaves nothing uncategorised', () => {
    expect(sectionOrder(buildPane())).not.toContain('<uncategorised>');
  });

  /**
   * Order is a deliberate reading: what kind of chart, what number a mark stands for,
   * what text it carries, where it sits, what the reader can do to it, how its edges
   * look, then the two variant-specific groups, then the shared Grafana blocks.
   */
  it('orders the sections as a top-to-bottom reading of the chart', () => {
    expect(sectionOrder(buildPane())).toEqual([
      'Relations',
      'Value',
      'Labels',
      'Layout',
      'Interaction',
      'Edges',
      'Sankey',
      'Chord',
      'Legend',
      'Tooltip',
    ]);
  });

  /** There is no "Advanced" section any more — the tier is carried by `showIf` alone. */
  it('has no Advanced catch-all section', () => {
    expect(sectionOrder(buildPane())).not.toContain('Advanced');
  });

  it.each([
    /**
     * Chart type first and editor mode **last**. The mode switch is a control about the
     * pane rather than about the chart, so the foot of the first section is where it
     * belongs — not a section of its own.
     */
    ['Relations', ['seriesType', 'editorMode']],
    ['Value', ['relationsTimeSlider']],
    [
      'Labels',
      [
        'relationsShowNodeLabels',
        'relationsShowNodeValues',
        'relationsHideOverlappingLabels',
        'relationsLabelOverflow',
        'relationsLabelWidth',
        // Registered by `addRelationsLinkOptions`, which is why it trails the node ones.
        // Filed here because it is *text* drawn on a mark, the same question the switches
        // above answer; the arrowhead is not text and stays under Edges.
        'relationsShowEdgeValues',
      ],
    ],
    [
      'Layout',
      [
        'relationsLayout',
        'relationsNodeSize',
        'relationsRepulsion',
        'relationsEdgeLength',
        'relationsGravity',
        'relationsLayoutAnimation',
        'animation.enabled',
      ],
    ],
    [
      'Interaction',
      ['relationsZoom', 'relationsPan', 'relationsRememberView', 'relationsDraggable', 'relationsFocusAdjacency'],
    ],
    // Colour and arrows are Default-tier; only curveness is still Advanced. "Show edge
    // values" is Default-tier too but is filed under Labels — see that entry.
    ['Edges', ['relationsLinkColor', 'relationsEdgeArrows', 'relationsCurveness']],
    [
      'Sankey',
      [
        // Node alignment before Flow direction: it decides what a column *means*, which
        // the direction then merely orients on screen.
        'relationsSankeyNodeAlign',
        'relationsSankeyOrient',
        'relationsSankeyNodeWidth',
        'relationsSankeyNodeGap',
        'relationsSankeyCurveness',
        'relationsSankeyLinkOpacity',
        'relationsSankeyLayoutIterations',
      ],
    ],
    [
      'Chord',
      [
        'relationsChordStartAngle',
        'relationsChordClockwise',
        'relationsChordPadAngle',
        'relationsChordMinAngle',
        'relationsChordLinkOpacity',
      ],
    ],
  ])('fills the %s section with exactly its own controls', (section, paths) => {
    expect(pathsIn(buildPane(), section)).toEqual(paths);
  });

  /**
   * **The animation switch is hidden on the graph variant, because ECharts ignores it
   * there.**
   *
   * Whether the root `animation` flag does anything is up to the series' view.
   * `SankeyView` gates a clip-path reveal on `seriesModel.isAnimationEnabled()` and
   * `ChordView` enters its group through `graphic.initProps`, so both animate. `GraphView`
   * writes node and edge positions straight through `SymbolDraw.updateLayout` /
   * `LineDraw.updateLayout` and consults the flag nowhere — measured in a real host, a
   * graph paints the same 2 frames with the switch on as with it off, while a sankey
   * paints ~64 over ~1s and a chord ~21.
   *
   * So a graph panel had **two** animation controls of which one was dead: this one, and
   * "Animate layout" (`force.layoutAnimation`) which does work. Hiding the dead one is
   * the whole point of the gate, and losing it would be invisible without this test —
   * the switch would simply go back to doing nothing.
   */
  it('hides the animation switch on graph, and offers it on sankey and chord', () => {
    const animation = buildPane().find((item) => item.path === 'animation.enabled');
    expect(animation).toBeDefined();
    const showIf = animation!.showIf!;
    const advanced = (seriesType: string) => ({ seriesType, editorMode: 'advanced' }) as PanelOptions;

    expect(showIf(advanced('graph'), undefined, undefined)).toBe(false);
    expect(showIf(advanced('sankey'), undefined, undefined)).toBe(true);
    expect(showIf(advanced('chord'), undefined, undefined)).toBe(true);
  });

  /**
   * The one that **does** work on a graph, so the pane is never left with no animation
   * control at all where animation is possible. It is Advanced (it repaints every
   * simulation step) and force-layout-only.
   */
  it('keeps the force layout animation, which is the graph one that works', () => {
    const layoutAnimation = buildPane().find((item) => item.path === 'relationsLayoutAnimation');
    expect(layoutAnimation).toBeDefined();
    expect(layoutAnimation!.category).toEqual(['Layout']);
    expect(
      layoutAnimation!.showIf!(
        { seriesType: 'graph', relationsLayout: 'force', editorMode: 'advanced' } as PanelOptions,
        undefined,
        undefined
      )
    ).toBe(true);
  });

  /**
   * **Two tooltip controls are unregistered, not merely hidden.**
   *
   * `commonOptionsBuilder.addTooltipOptions` adds the bundle unconditionally, and core
   * gates both of these on `tooltip.mode === 'multi'` — which `singleTooltipOnly: true`
   * has just removed from the mode picker, because a relations hover is one node or one
   * link and "All" has nothing to list. So both had no reachable state in which they
   * could act. Offered and inert is worse than absent.
   */
  it('drops the tooltip controls that only a Multi-mode tooltip could reach', () => {
    const tooltip = pathsIn(buildPane(), 'Tooltip');

    expect(tooltip).not.toContain('tooltip.sort');
    expect(tooltip).not.toContain('tooltip.hideZeros');
    // The mode picker itself stays — it still offers Single vs Hidden.
    expect(tooltip).toContain('tooltip.mode');
  });
});
