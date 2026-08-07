import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import { relationsCategoryName } from 'editor/constants';
import { isChordVariant } from 'editor/chord';
import { isGraphVariant, isSankeyVariant } from 'editor/sankey';
import { type SeriesTypeOption } from 'editor/types';
import { RELATIONS_LAYOUT_DEFAULT } from 'lib/echarts/options/graph';
import { addRelationsLayoutOptions } from 'lib/grafana/editor/relations/layout';
import { type PanelOptions } from 'types';

/**
 * The "Layout" control, and the variant predicate every graph-only control in this
 * family is gated on.
 *
 * See `nodes.test.ts` for why `standardEditorsRegistry` has to be stubbed.
 */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() => ['radio'].map((id) => ({ id, name: id, editor: noEditor })));

const options = (extra: Partial<PanelOptions> = {}): PanelOptions => extra as PanelOptions;

const layoutOption = () => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsLayoutOptions(builder);
  const items = builder.getItems();
  expect(items).toHaveLength(1);
  return items[0];
};

describe('addRelationsLayoutOptions', () => {
  /**
   * The path and default are what a saved dashboard is keyed on and what a fresh panel
   * renders with, so both are part of the contract rather than an implementation detail:
   * renaming the path silently orphans every stored value, and the default has to be the
   * one `getGraphLayout` falls back to or a fresh panel would draw one layout while the
   * radio showed another.
   */
  it('registers the layout radio at the path the render path reads', () => {
    const item = layoutOption();

    expect(item.path).toBe('relationsLayout');
    expect(item.name).toBe('Layout');
    expect(item.category).toEqual([relationsCategoryName]);
    expect(item.defaultValue).toBe(RELATIONS_LAYOUT_DEFAULT);
  });

  // Force / Circular / Fixed, and no fourth: the values are ECharts' `series.graph.layout`
  // keywords, so a typo here is a layout ECharts ignores rather than an error.
  it('offers exactly the three ECharts layout keywords', () => {
    const settings = layoutOption().settings as { options: Array<{ value: string; label: string }> };

    expect(settings.options.map(({ value }) => value)).toEqual(['force', 'circular', 'none']);
    expect(settings.options.map(({ label }) => label)).toEqual(['Force', 'Circular', 'Fixed']);
  });

  // Graph-only: a sankey self-layouts into columns and a chord into a ring, so neither
  // has a comparable choice and the control is hidden rather than shown inert.
  it('is shown for the graph variant and hidden for the other two', () => {
    const showIf = layoutOption().showIf;

    expect(showIf?.(options({ seriesType: 'graph' }))).toBe(true);
    expect(showIf?.(options({ seriesType: 'sankey' }))).toBe(false);
    expect(showIf?.(options({ seriesType: 'chord' }))).toBe(false);
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
