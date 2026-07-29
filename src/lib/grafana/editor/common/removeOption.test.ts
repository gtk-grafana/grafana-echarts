import { PanelOptionsEditorBuilder } from '@grafana/data';
import { removeOption } from './removeOption';

// addCustomEditor pushes the config straight onto the builder's item list, so it
// exercises removeOption without needing the standard editors registry.
const nullEditor = () => null;
const buildWithPaths = () => {
  const builder = new PanelOptionsEditorBuilder<Record<string, unknown>>();
  builder
    .addCustomEditor({ id: 'a', path: 'a', name: 'A', editor: nullEditor })
    .addCustomEditor({ id: 'b', path: 'b', name: 'B', editor: nullEditor })
    .addCustomEditor({ id: 'c', path: 'c', name: 'C', editor: nullEditor });
  return builder;
};

describe('removeOption', () => {
  it('removes the editor registered at the given path', () => {
    const builder = buildWithPaths();
    removeOption(builder, 'b');
    expect(builder.getItems().map((item) => item.path)).toEqual(['a', 'c']);
  });

  it('is a no-op when the path is not present', () => {
    const builder = buildWithPaths();
    removeOption(builder, 'missing');
    expect(builder.getItems().map((item) => item.path)).toEqual(['a', 'b', 'c']);
  });
});
