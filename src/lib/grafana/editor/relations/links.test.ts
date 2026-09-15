import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import {
  RELATIONS_LINK_COLOR_DEFAULT,
  relationsEdgesCategoryName,
  relationsLabelsCategoryName,
} from 'editor/relations/constants';

import {
  blendsGradient,
  linkColorChoices,
  RelationsLinkColorEditor,
} from 'lib/grafana/editor/relations/RelationsLinkColorEditor';
import { type PanelOptions } from 'types';
import { addRelationsLinkOptions } from './links';

/** See `labels.test.ts` for why `standardEditorsRegistry` has to be stubbed. */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'number', 'slider'].map((id) => ({ id, name: id, editor: noEditor }))
);

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => extra as PanelOptions;

const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLinkOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === path);
  expect(item).toBeDefined();
  return item!;
};

const linkColorOption = () => optionAt('relationsLinkColor');

const labelsFor = (panelOptions: PanelOptions) => linkColorChoices(panelOptions).map(({ label }) => label);

/** The relabelled entry, spelled out here because it is user-facing copy. */
const DEGRADED = 'Gradient (draws as "Source")';

describe('addRelationsLinkOptions — Link color', () => {
  /**
   * The path is what a saved dashboard is keyed on and the default is what every variant's
   * `?? RELATIONS_LINK_COLOR_DEFAULT` falls back to, so both are contract rather than
   * detail. Registered through `addCustomEditor` because the choice list is contextual.
   */
  it('registers the component editor in the Edges section', () => {
    const item = linkColorOption();

    expect(item.path).toBe('relationsLinkColor');
    expect(item.name).toBe('Link color');
    expect(item.defaultValue).toBe(RELATIONS_LINK_COLOR_DEFAULT);
    expect(item.category).toEqual([relationsEdgesCategoryName]);
    expect(item.editor).toBe(RelationsLinkColorEditor);
  });

  /**
   * The always-on `description` is the option's purpose and nothing more. The precedence
   * caveat lives behind the info icon — see `LINK_COLOR_PRECEDENCE_HELP` for why a
   * `description` was the wrong home for it.
   */
  it('keeps the standing description to one clause', () => {
    expect(linkColorOption().description).toBe('Which node a link inherits its color from');
  });

  /**
   * **Default-tier.** An edge's colour is the first thing about it a reader configures;
   * it applies to all three render variants; and the two endpoint keywords have no
   * equivalent anywhere else in the pane. So it carries no gate at all — its section is
   * what places it, not a tier.
   *
   * Which is also why it is absent from `ADVANCED_RELATIONS_DEFAULTS`: a Default-tier
   * control the render path resets in Default mode would show one value and draw
   * another. `advancedTier.test.ts` asserts that both ways round.
   */
  it('carries no editor-mode gate', () => {
    expect(linkColorOption().showIf).toBeUndefined();
  });
});

/**
 * **The section is chosen by what a control *is*, not by which supplier registers it.**
 * Everything in this file is about an edge, but "Show edge values" answers the same
 * question the node label switches do — what *text* is drawn on a mark — so it is filed
 * under Labels. The arrowhead is not text, and is not optional in the same sense (it is
 * how a directed edge reads at all), so it stays with the edge styling.
 */
describe('addRelationsLinkOptions — sections', () => {
  it('files the edge styling under Edges', () => {
    for (const path of ['relationsLinkColor', 'relationsEdgeArrows', 'relationsCurveness']) {
      expect(optionAt(path).category).toEqual([relationsEdgesCategoryName]);
    }
  });

  it('files the edge-value switch under Labels', () => {
    expect(optionAt('relationsShowEdgeValues').category).toEqual([relationsLabelsCategoryName]);
  });

  /**
   * **Only the curvature is still Advanced.** An edge is directed by contract, and on a
   * force layout the arrowhead is the only thing that says which way, so something the
   * chart is unreadable without is not an expert setting. Asserted on a graph fixture in
   * Default mode, since all three of these are graph-reachable.
   */
  it('gates only the curvature behind Advanced mode', () => {
    const graph = options({ seriesType: 'graph' });

    expect(optionAt('relationsEdgeArrows').showIf?.(graph, undefined, undefined)).toBe(true);
    expect(optionAt('relationsShowEdgeValues').showIf?.(graph, undefined, undefined)).toBe(true);
    expect(optionAt('relationsCurveness').showIf?.(graph, undefined, undefined)).toBe(false);
  });
});

describe('linkColorChoices', () => {
  /** Three values, always — only the Gradient *label* is contextual. */
  it.each([
    ['sankey', options({ seriesType: 'sankey' })],
    ['chord', options({ seriesType: 'chord' })],
    ['graph, force', options({ seriesType: 'graph', relationsLayout: 'force' })],
    ['graph, fixed', options({ seriesType: 'graph', relationsLayout: 'none' })],
    ['unconfigured', options()],
  ])('offers the same three values (%s)', (_name, panelOptions) => {
    expect(linkColorChoices(panelOptions).map(({ value }) => value)).toEqual(['source', 'target', 'gradient']);
  });

  /**
   * A sankey is the one variant that blends unconditionally: `SankeyView` implements all
   * three keywords itself, so the entry is offered plainly.
   */
  it('offers a plain Gradient on a sankey', () => {
    expect(labelsFor(options({ seriesType: 'sankey' }))[2]).toBe('Gradient');
    expect(blendsGradient(options({ seriesType: 'sankey' }))).toBe(true);
  });

  /**
   * A chord never blends — `getChordLinkStyle` maps the keyword to `'source'` because a
   * wide ribbon at 0.2 opacity washes out — so the entry says so rather than promising a
   * blend. Kept in the list because `gradient` is the persisted default.
   */
  it('says what a chord really draws, whatever the layout says', () => {
    expect(labelsFor(options({ seriesType: 'chord' }))[2]).toBe(DEGRADED);
    expect(labelsFor(options({ seriesType: 'chord', relationsLayout: 'none' }))[2]).toBe(DEGRADED);
  });

  /**
   * On a graph the condition is the *layout*, not the variant: only `none` knows its node
   * positions before ECharts lays the graph out, and an unoriented bbox gradient would run
   * source-to-target for roughly half the edges. An absent layout counts, since data that
   * pins every node infers `none` (`getGraphLayout`) — the safe direction, since it never
   * hides a blend that does happen.
   */
  it.each([
    ['force', DEGRADED],
    ['circular', DEGRADED],
    ['none', 'Gradient'],
    [undefined, 'Gradient'],
  ])('labels Gradient by what the %s layout can orient', (relationsLayout, label) => {
    expect(labelsFor(options({ seriesType: 'graph', relationsLayout } as Partial<PanelOptions>))[2]).toBe(label);
  });
});
