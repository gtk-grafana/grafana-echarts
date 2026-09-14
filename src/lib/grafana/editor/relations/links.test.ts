import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import { advancedOptionsCategoryName } from 'editor/constants';
import { RELATIONS_LINK_COLOR_DEFAULT } from 'lib/echarts/options/graph';
import {
  blendsGradient,
  linkColorChoices,
  RelationsLinkColorEditor,
} from 'lib/grafana/editor/relations/RelationsLinkColorEditor';
import { type PanelOptions } from 'types';
import { addRelationsLinkOptions } from './links';

/** See `nodes.test.ts` for why `standardEditorsRegistry` has to be stubbed. */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() =>
  ['boolean', 'select', 'number', 'slider'].map((id) => ({ id, name: id, editor: noEditor }))
);

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => extra as PanelOptions;

const linkColorOption = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLinkOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === 'relationsLinkColor');
  expect(item).toBeDefined();
  return item!;
};

const labelsFor = (panelOptions: PanelOptions) => linkColorChoices(panelOptions).map(({ label }) => label);

/** The relabelled entry, spelled out here because it is user-facing copy. */
const DEGRADED = 'Gradient (draws as "Source")';

describe('addRelationsLinkOptions — Link color', () => {
  /**
   * The path is what a saved dashboard is keyed on and the default is what every variant's
   * `?? RELATIONS_LINK_COLOR_DEFAULT` falls back to, so both are contract rather than
   * detail. Registered through `addCustomEditor` rather than `addAdvancedSelect`, so the
   * Advanced category and the editor-mode gate are restated by hand — asserted here
   * because nothing else would notice their absence.
   */
  it('registers the component editor in the Advanced tier', () => {
    const item = linkColorOption();

    expect(item.path).toBe('relationsLinkColor');
    expect(item.name).toBe('Link color');
    expect(item.defaultValue).toBe(RELATIONS_LINK_COLOR_DEFAULT);
    expect(item.category).toEqual([advancedOptionsCategoryName]);
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

  it('is hidden outside Advanced editor mode', () => {
    const showIf = linkColorOption().showIf;

    expect(showIf?.(options({ editorMode: 'advanced' } as Partial<PanelOptions>), undefined, undefined)).toBe(true);
    expect(showIf?.(options(), undefined, undefined)).toBe(false);
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
