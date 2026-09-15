import { buildRelationsPane } from 'test/relationsPane';
import { type PanelOptions } from 'types';

/**
 * Pin the complete structure of the relations options pane.
 * Individual option suites cannot detect a control in the wrong section or an accidental catch-all section.
 * This suite also records controls that are intentionally absent.
 */
const buildPane = buildRelationsPane;

/** Section order as the pane renders it: first registration wins. */
const sectionOrder = (items: ReturnType<typeof buildPane>) => [
  ...new Set(items.map((item) => item.category?.[0] ?? '<uncategorised>')),
];

const pathsIn = (items: ReturnType<typeof buildPane>, section: string) =>
  items.filter((item) => item.category?.[0] === section).map((item) => item.path);

describe('the relations options pane', () => {
  it('leaves nothing uncategorised', () => {
    expect(sectionOrder(buildPane())).not.toContain('<uncategorised>');
  });

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

  /** The `showIf` callback controls the advanced tier. */
  it('has no Advanced catch-all section', () => {
    expect(sectionOrder(buildPane())).not.toContain('Advanced');
  });

  it.each([
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
    ['Edges', ['relationsLinkColor', 'relationsEdgeArrows', 'relationsCurveness']],
    [
      'Sankey',
      [
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
   * ECharts ignores the root animation flag for graph.
   * A host measurement gave graph 2 frames with the flag on and 2 with it off.
   * Sankey gave about 64 frames with the flag on and 2 with it off.
   * Chord gave about 21 frames with the flag on and 3 with it off.
   * Graph keeps `relationsLayoutAnimation`, which controls force-simulation frames.
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
   * Grafana shows `tooltip.sort` and `tooltip.hideZeros` only when `tooltip.mode` is `multi`.
   * `singleTooltipOnly` removes `multi` because a relations hover contains one mark.
   * These controls are unregistered because no reachable state can use them.
   */
  it('drops the tooltip controls that only a Multi-mode tooltip could reach', () => {
    const tooltip = pathsIn(buildPane(), 'Tooltip');

    expect(tooltip).not.toContain('tooltip.sort');
    expect(tooltip).not.toContain('tooltip.hideZeros');
    // The mode picker still offers Single and Hidden.
    expect(tooltip).toContain('tooltip.mode');
  });
});
