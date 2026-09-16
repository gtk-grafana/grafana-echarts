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
  it('registers the component editor in the Edges section', () => {
    const item = linkColorOption();

    expect(item.path).toBe('relationsLinkColor');
    expect(item.name).toBe('Link color');
    expect(item.defaultValue).toBe(RELATIONS_LINK_COLOR_DEFAULT);
    expect(item.category).toEqual([relationsEdgesCategoryName]);
    expect(item.editor).toBe(RelationsLinkColorEditor);
  });

  it('keeps the standing description to one clause', () => {
    expect(linkColorOption().description).toBe('Which node a link inherits its color from');
  });

  it('carries no editor-mode gate', () => {
    expect(linkColorOption().showIf).toBeUndefined();
  });
});

describe('addRelationsLinkOptions — sections', () => {
  it('files the edge styling under Edges', () => {
    for (const path of ['relationsLinkColor', 'relationsEdgeArrows', 'relationsCurveness']) {
      expect(optionAt(path).category).toEqual([relationsEdgesCategoryName]);
    }
  });

  it('files the edge-value switch under Labels', () => {
    expect(optionAt('relationsShowEdgeValues').category).toEqual([relationsLabelsCategoryName]);
  });

  it('gates only the curvature behind Advanced mode', () => {
    const graph = options({ seriesType: 'graph' });

    expect(optionAt('relationsEdgeArrows').showIf?.(graph, undefined, undefined)).toBe(true);
    expect(optionAt('relationsShowEdgeValues').showIf?.(graph, undefined, undefined)).toBe(true);
    expect(optionAt('relationsCurveness').showIf?.(graph, undefined, undefined)).toBe(false);
  });
});

describe('linkColorChoices', () => {
  /** The Gradient label changes with the chart type and layout. */
  it.each([
    ['sankey', options({ seriesType: 'sankey' })],
    ['chord', options({ seriesType: 'chord' })],
    ['graph, force', options({ seriesType: 'graph', relationsLayout: 'force' })],
    ['graph, fixed', options({ seriesType: 'graph', relationsLayout: 'none' })],
    ['unconfigured', options()],
  ])('offers the same three values (%s)', (_name, panelOptions) => {
    expect(linkColorChoices(panelOptions).map(({ value }) => value)).toEqual(['source', 'target', 'gradient']);
  });

  it.each(['sankey', 'chord'] as const)('offers a plain Gradient on a %s chart', (seriesType) => {
    const panelOptions = options({ seriesType });
    expect(labelsFor(panelOptions)[2]).toBe('Gradient');
    expect(blendsGradient(panelOptions)).toBe(true);
  });

  it.each([
    ['force', DEGRADED],
    ['circular', DEGRADED],
    ['none', 'Gradient'],
    [undefined, 'Gradient'],
  ])('labels Gradient by what the %s layout can orient', (relationsLayout, label) => {
    expect(labelsFor(options({ seriesType: 'graph', relationsLayout } as Partial<PanelOptions>))[2]).toBe(label);
  });
});
