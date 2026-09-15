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
/**
 * The "Layout" control, and the variant predicate every graph-only control in this
 * family is gated on.
 *
 * See `labels.test.ts` for why `standardEditorsRegistry` has to be stubbed.
 */
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
  /**
   * The path and default are what a saved dashboard is keyed on and what a fresh panel
   * renders with, so both are part of the contract rather than an implementation detail:
   * renaming the path silently orphans every stored value, and the default has to be the
   * one `getGraphLayout` falls back to or a fresh panel would draw one layout while the
   * radio showed another.
   */
  it('registers the layout control at the path the render path reads', () => {
    const item = layoutOption();

    expect(item.path).toBe('relationsLayout');
    expect(item.name).toBe('Layout');
    expect(item.category).toEqual([relationsLayoutCategoryName]);
    expect(item.defaultValue).toBe(RELATIONS_LAYOUT_DEFAULT);
    // A component, not the standard `radio` editor, because the choice list depends on
    // the editor mode. See `RelationsLayoutEditor`.
    expect(item.editor).toBe(RelationsLayoutEditor);
  });

  /**
   * Node size shares the section: it is how big a mark is, which is the same subject as
   * where it sits — and not the label switches' subject. Both are graph-only.
   */
  it('registers node size in the same section, and nothing else', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsLayoutOptions(builder);

    expect(builder.getItems().map((item) => item.path)).toEqual(['relationsLayout', 'relationsNodeSize']);
    expect(optionAt('relationsNodeSize').category).toEqual([relationsLayoutCategoryName]);
  });

  // Graph-only: a sankey self-layouts into columns and a chord into a ring, so neither
  // has a comparable choice and the control is hidden rather than shown inert.
  it('is shown for the graph variant and hidden for the other two', () => {
    const showIf = layoutOption().showIf;

    expect(showIf?.(options({ seriesType: 'graph' }))).toBe(true);
    expect(showIf?.(options({ seriesType: 'sankey' }))).toBe(false);
    expect(showIf?.(options({ seriesType: 'chord' }))).toBe(false);
  });

  /**
   * The control itself stays Default-tier — it is the closest thing to core Grafana's
   * Node graph "Layout" option, so gating the whole thing would be wrong. It is only the
   * **Fixed choice** that is Advanced, and that has to be done inside the editor
   * component, since `showIf` can hide an option but not one of its values.
   */
  it('is Default-tier as a whole', () => {
    expect(layoutOption().showIf?.(options({ seriesType: 'graph', editorMode: 'default' }))).toBe(true);
  });
});

/**
 * **Fixed is an Advanced-only choice.** It is not a layout the panel can satisfy on its
 * own: it pins each node at its `custom.fixedX`/`fixedY` and seeds anything without a
 * pair on a ring, so picking it without having supplied those coordinates gives a ring
 * of unplaced nodes rather than a layout. Force and Circular work on any data, so they
 * stay offered always.
 */
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

  /**
   * The exception that keeps the control resolvable. `relationsLayout` is Default-tier
   * so it is not in `ADVANCED_RELATIONS_DEFAULTS` and is never reset — a panel saved as
   * Fixed in Advanced mode still *renders* Fixed after switching back. Dropping the entry
   * there would leave the radio with no button selected and no way to change it from the
   * pane. Same shape as the time slider's `|| options.relationsTimeSlider === true` gate.
   */
  it('keeps Fixed offered in Default mode when it is already the stored value', () => {
    expect(valuesFor({ relationsLayout: ADVANCED_LAYOUT_CHOICE })).toEqual(['force', 'circular', 'none']);
  });
});

/**
 * **`isGraphVariant` is an explicit membership test, not `!isSankeyVariant`.**
 *
 * The inverse would also match `chord`, which would put Layout, force tuning, node size,
 * edge arrows and link curveness on a chord panel — controls the chord series has no
 * equivalent for, so every one of them would be inert. The three predicates are
 * therefore asserted as a partition over the family's `seriesType` values, plus the two
 * unset forms a stored panel can actually hold.
 */
describe('relations variant predicates', () => {
  const VARIANTS: SeriesTypeOption[] = ['graph', 'sankey', 'chord'];

  it.each(VARIANTS)('claims %s for exactly one variant', (seriesType) => {
    const claims = [isGraphVariant, isSankeyVariant, isChordVariant].filter((predicate) => predicate({ seriesType }));

    expect(claims).toHaveLength(1);
  });

  // Graph is the family default, so a panel that never wrote a `seriesType` — and one
  // carrying the `'Auto'` sentinel a per-field override can hold — is a graph.
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
