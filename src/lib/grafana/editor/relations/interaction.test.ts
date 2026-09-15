import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';
import { type PanelOptions } from 'types';
import { addRelationsInteractionOptions } from './interaction';

const noEditor = (): null => null;
standardEditorsRegistry.setInit(() => ['boolean'].map((id) => ({ id, name: id, editor: noEditor })));

const optionAt = (path: string) => {
  const builder = new PanelOptionsEditorBuilder<PanelOptions>();
  addRelationsInteractionOptions(builder);
  const item = builder.getItems().find((entry) => entry.path === path);
  expect(item).toBeDefined();
  return item!;
};

const options = (extra: Partial<PanelOptions> = {}): PanelOptions =>
  ({ editorMode: 'advanced', ...extra }) as PanelOptions;

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
