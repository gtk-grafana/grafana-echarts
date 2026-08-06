import { createDataFrame, FieldType, getPanelDataSummary, VisualizationSuggestionScore } from '@grafana/data';
import {
  PREVIEW_MAX_SERIES,
  RELATIONS_CHORD_MAX_NODES,
  RELATIONS_MAX_EDGES,
} from 'lib/echarts/charts/suggestionLimits';
import { type PanelOptions } from 'types';
import { relationsSuggestionsSupplier } from './suggestions';

// This family used to be permanently silent, on the grounds that
// `PanelDataSummary` could see neither the `id`/`source`/`target` field shape nor
// `meta.preferredVisualisationType`. It exposes both (`rawFrames` and
// `hasPreferredVisualisationType`), so these tests pin the real signal — including
// that an ordinary table is still *not* claimed, which was the original worry.
const edgesFrame = (rows: number) =>
  createDataFrame({
    name: 'edges',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `e${row}`) },
      { name: 'source', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'target', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row + 1}`) },
    ],
  });

const nodesFrame = (rows: number) =>
  createDataFrame({
    name: 'nodes',
    fields: [
      { name: 'id', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `n${row}`) },
      { name: 'title', type: FieldType.string, values: Array.from({ length: rows }, (_, row) => `node ${row}`) },
    ],
  });

describe('relationsSuggestionsSupplier', () => {
  it('suggests graph, sankey and chord for a node graph frame pair', () => {
    const result = relationsSuggestionsSupplier(getPanelDataSummary([nodesFrame(3), edgesFrame(2)]));

    expect(result).toHaveLength(3);
    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Graph', 'Sankey', 'Chord']);
    expect(result!.map((suggestion) => suggestion.options?.seriesType)).toEqual(['graph', 'sankey', 'chord']);
    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Good)).toBe(true);
  });

  it('suggests all three for an edges-only response', () => {
    const result = relationsSuggestionsSupplier(getPanelDataSummary([edgesFrame(2)]));

    expect(result).toHaveLength(3);
  });

  it('scores Best for the nodeGraph preferred visualisation hint', () => {
    const frame = edgesFrame(2);
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([{ ...frame, meta: { preferredVisualisationType: 'nodeGraph' } }])
    );

    expect(result!.every((suggestion) => suggestion.score === VisualizationSuggestionScore.Best)).toBe(true);
  });

  // The reason the old comment gave for staying silent: any reachable proxy would
  // claim ordinary tables. Requiring *both* `source` and `target` is what avoids it.
  it('returns void for an ordinary two-string-column table', () => {
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'host', type: FieldType.string, values: ['a', 'b'] },
            { name: 'region', type: FieldType.string, values: ['eu', 'us'] },
          ],
        }),
      ])
    );
    expect(result).toBeUndefined();
  });

  it('returns void for a table with a source column but no target', () => {
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([
        createDataFrame({
          fields: [
            { name: 'source', type: FieldType.string, values: ['a', 'b'] },
            { name: 'count', type: FieldType.number, values: [1, 2] },
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

  it(`returns void past ${RELATIONS_MAX_EDGES} edges`, () => {
    // Graph and Sankey only at the ceiling: an edges-only response of this size also
    // exceeds the chord node budget, which is the tighter of the two caps.
    expect(relationsSuggestionsSupplier(getPanelDataSummary([edgesFrame(RELATIONS_MAX_EDGES)]))).toHaveLength(2);
    expect(relationsSuggestionsSupplier(getPanelDataSummary([edgesFrame(RELATIONS_MAX_EDGES + 1)]))).toBeUndefined();
  });

  it(`drops the chord card past ${RELATIONS_CHORD_MAX_NODES} nodes, keeping graph and sankey`, () => {
    const result = relationsSuggestionsSupplier(
      getPanelDataSummary([nodesFrame(RELATIONS_CHORD_MAX_NODES + 1), edgesFrame(50)])
    );

    expect(result!.map((suggestion) => suggestion.name)).toEqual(['Graph', 'Sankey']);
  });

  it('bounds every preview card and suppresses node labels', () => {
    const result = relationsSuggestionsSupplier(getPanelDataSummary([nodesFrame(3), edgesFrame(2)]));

    expect(result!.every((suggestion) => suggestion.cardOptions?.maxSeries === PREVIEW_MAX_SERIES)).toBe(true);

    const preview: { options?: Partial<PanelOptions> } = { options: { ...result![0].options } };
    result![0].cardOptions!.previewModifier!(preview);
    expect(preview.options?.relationsShowNodeLabels).toBe(false);
    expect(preview.options?.legend?.showLegend).toBe(false);
  });
});
