import { PanelOptionsEditorBuilder, standardEditorsRegistry } from '@grafana/data';

import { addRelationsPerformanceOptions } from 'lib/grafana/editor/relations/performance';
import { type PanelOptions } from 'types';

const noEditor = (): null => null;
standardEditorsRegistry.setInit(() => [{ id: 'number', name: 'number', editor: noEditor }]);

describe('Relations performance options', () => {
  it('registers an Advanced integer Max nodes + edges control', () => {
    const builder = new PanelOptionsEditorBuilder<PanelOptions>();
    addRelationsPerformanceOptions(builder);
    const item = builder.getItems()[0];

    expect(item).toMatchObject({
      path: 'relationsMaxMarks',
      name: 'Max nodes + edges',
      category: ['Performance'],
      settings: { step: 1, integer: true, placeholder: '' },
    });
    expect(item.description).toContain('Override default safety limits');
    expect(item.showIf?.({ editorMode: 'advanced' } as PanelOptions, undefined, undefined)).toBe(true);
    expect(item.showIf?.({ editorMode: 'default' } as PanelOptions, undefined, undefined)).toBe(false);
  });
});
