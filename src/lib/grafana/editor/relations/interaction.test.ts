import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import { type PanelOptions } from 'types';
import { addRelationsInteractionOptions } from './interaction';

/**
 * `standardEditorsRegistry` is filled by Grafana core app code a plugin cannot import, so
 * under jest it is empty and every `builder.addX` throws looking its editor component up.
 * Stubbing the ids is the supported way in — nothing is rendered here; what is under test is
 * the `showIf` each option carries. Same shape of answer as `nodes.test.ts`.
 */
const noEditor = (): null => null;
standardEditorsRegistry.setInit(() => ['boolean'].map((id) => ({ id, name: id, editor: noEditor })));

const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsInteractionOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === path);
  expect(item).toBeDefined();
  return item!;
};

/**
 * Every option here is Advanced-tier, and `addAdvancedBooleanSwitch` ANDs that gate into the
 * `showIf` it registers — so the mode is set on every fixture and the variant/layout condition
 * is what the assertions vary. Advanced mode itself is covered where the gate lives.
 */
const options = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({ editorMode: 'advanced', ...extra }) as PanelOptions;

/**
 * **Draggable nodes is only offered where a drag is an edit.** Under `Fixed` the position *is*
 * the layout, so the panel writes it back; the sankey re-lays out around a dragged node and
 * remembers it in its own 0-1 space.
 *
 * Force and circular are excluded because both re-solve on every render — so nothing could be
 * kept — and because both are actively broken while dragging. Circular re-solves the ring from
 * the drop point, and force re-runs the simulation per pointer move, synchronously to
 * convergence, since `layoutAnimation` is off by default here.
 */
describe('Draggable nodes', () => {
  const showIf = () => optionAt('relationsDraggable').showIf!;

  it('is offered on a graph under the fixed layout', () => {
    expect(showIf()(options({ seriesType: 'graph', relationsLayout: 'none' }))).toBe(true);
  });

  it('is offered on the sankey variant, whatever the graph layout says', () => {
    expect(showIf()(options({ seriesType: 'sankey' }))).toBe(true);
    expect(showIf()(options({ seriesType: 'sankey', relationsLayout: 'force' }))).toBe(true);
  });

  it('is hidden on a graph under force — including the default, which is force', () => {
    expect(showIf()(options({ seriesType: 'graph', relationsLayout: 'force' }))).toBe(false);
    expect(showIf()(options({ seriesType: 'graph' }))).toBe(false);
  });

  it('is hidden on a graph under circular', () => {
    expect(showIf()(options({ seriesType: 'graph', relationsLayout: 'circular' }))).toBe(false);
  });

  it('is hidden on the chord variant, which has no node positions at all', () => {
    expect(showIf()(options({ seriesType: 'chord' }))).toBe(false);
  });
});

// Zoom, pan and Remember view all need a view coordinate system, which `series.chord` has not.
describe('view options', () => {
  it.each(['relationsZoom', 'relationsPan', 'relationsRememberView'])('%s is hidden on chord', (path) => {
    const showIf = optionAt(path).showIf!;

    expect(showIf(options({ seriesType: 'graph' }))).toBe(true);
    expect(showIf(options({ seriesType: 'sankey' }))).toBe(true);
    expect(showIf(options({ seriesType: 'chord' }))).toBe(false);
  });
});
