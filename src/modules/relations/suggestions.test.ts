import { createDataFrame, FieldType, getPanelDataSummary } from '@grafana/data';
import { relationsSuggestionsSupplier } from './suggestions';

// The relations supplier never suggests: `PanelDataSummary` cannot see the
// `id`/`source`/`target` field shape or `meta.preferredVisualisationType` that
// identify node-graph data. These tests pin that deliberate silence — in
// particular that node-graph data itself does *not* produce a suggestion, so the
// behaviour is understood as a known gap rather than mistaken for a bug.
describe('relationsSuggestionsSupplier', () => {
  it('returns void for a node graph frame pair (the gap this documents)', () => {
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          name: 'edges',
          fields: [
            { name: 'id', type: FieldType.string, values: ['e1'] },
            { name: 'source', type: FieldType.string, values: ['a'] },
            { name: 'target', type: FieldType.string, values: ['b'] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for unrelated numeric data', () => {
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: [0, 100] },
            { name: 'value', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for an empty response', () => {
    expect(relationsSuggestionsSupplier(getPanelDataSummary([]))).toBeUndefined();
  });
});
