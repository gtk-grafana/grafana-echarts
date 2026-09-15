import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import { type SeriesTypeOption } from 'editor/types';

import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { type PanelOptions } from 'types';

import { RELATIONS_LAYOUT_DEFAULT, relationsLayoutCategoryName } from 'editor/relations/constants';
import { isChordVariant, isGraphVariant, isSankeyVariant } from 'editor/relations/variants';
import {
  ADVANCED_LAYOUT_CHOICE,
  layoutChoices,
  RelationsLayoutEditor,
} from 'lib/grafana/editor/relations/RelationsLayoutEditor';
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() => ['radio', 'slider'].map((id) => ({ id, name: id, editor: noEditor })));

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => extra as PanelOptions;

const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLayoutOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === path);
  expect(item).toBeDefined();
  return item!;
};

const layoutOption = () => optionAt('relationsLayout');

describe('addRelationsLayoutOptions', () => {
  it('registers the layout control at the path the render path reads', () => {
    const item = layoutOption();

    expect(item.path).toBe('relationsLayout');
    expect(item.name).toBe('Layout');
    expect(item.category).toEqual([relationsLayoutCategoryName]);
    expect(item.defaultValue).toBe(RELATIONS_LAYOUT_DEFAULT);
    expect(item.editor).toBe(RelationsLayoutEditor);
  });

  it('registers node size in the same section, and nothing else', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsLayoutOptions(builder);

    expect(builder.getItems().map((item) => item.path)).toEqual(['relationsLayout', 'relationsNodeSize']);
    expect(optionAt('relationsNodeSize').category).toEqual([relationsLayoutCategoryName]);
  });

  it('is shown for the graph variant and hidden for the other two', () => {
    const showIf = layoutOption().showIf;

    expect(showIf?.(options({ seriesType: 'graph' }))).toBe(true);
    expect(showIf?.(options({ seriesType: 'sankey' }))).toBe(false);
    expect(showIf?.(options({ seriesType: 'chord' }))).toBe(false);
  });

  it('is Default-tier as a whole', () => {
    expect(layoutOption().showIf?.(options({ seriesType: 'graph', editorMode: 'default' }))).toBe(true);
  });
});

describe('layoutChoices', () => {
  const valuesFor = (opts: Partial<PanelOptions>) => layoutChoices(opts).map(({ value }) => value);

  it('offers all three ECharts keywords in Advanced mode', () => {
    expect(valuesFor({ editorMode: 'advanced' })).toEqual(['force', 'circular', 'none']);
    expect(layoutChoices({ editorMode: 'advanced' }).map(({ label }) => label)).toEqual(['Force', 'Circular', 'Fixed']);
  });

  it('drops Fixed in Default mode', () => {
    expect(valuesFor({})).toEqual(['force', 'circular']);
    expect(valuesFor({ editorMode: 'default' })).toEqual(['force', 'circular']);
  });

  it('keeps Fixed offered in Default mode when it is already the stored value', () => {
    expect(valuesFor({ relationsLayout: ADVANCED_LAYOUT_CHOICE })).toEqual(['force', 'circular', 'none']);
  });
});

describe('relations variant predicates', () => {
  const VARIANTS: SeriesTypeOption[] = ['graph', 'sankey', 'chord'];

  it.each(VARIANTS)('claims %s for exactly one variant', (seriesType) => {
    const claims = [isGraphVariant, isSankeyVariant, isChordVariant].filter((predicate) => predicate({ seriesType }));

    expect(claims).toHaveLength(1);
  });

  it('reads an unset or Auto seriesType as the graph default', () => {
    expect(isGraphVariant({})).toBe(true);
    expect(isGraphVariant({ seriesType: 'Auto' })).toBe(true);
    expect(isSankeyVariant({})).toBe(false);
    expect(isChordVariant({})).toBe(false);
  });

  // The regression the explicit membership test exists to prevent, stated directly.
  it('does not claim chord for the graph variant, as the inverse of sankey would', () => {
    expect(isGraphVariant({ seriesType: 'chord' })).toBe(false);
    expect(!isSankeyVariant({ seriesType: 'chord' })).toBe(true);
  });
});
