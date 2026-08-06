import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import { legacyToWideOperator } from 'lib/echarts/converters/legacyToWide';
import { longToWideOperator } from 'lib/echarts/converters/longToWide';
import { relationsDataTransformations } from './dataTransformations';

const rowEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1'] },
      { name: 'source', type: FieldType.string, values: ['a'] },
      { name: 'target', type: FieldType.string, values: ['b'] },
      { name: 'mainstat', type: FieldType.number, values: [10] },
    ],
  });

/** One frame of a labelled datasource's long response — a Prometheus series. */
const longEdge = (source: string, target: string): DataFrame =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', type: FieldType.time, values: [1700000000000] },
      { name: 'Value', type: FieldType.number, labels: { source, target }, values: [10] },
    ],
  });

const wideEdges = (): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] }],
  });

describe('relationsDataTransformations', () => {
  it('registers the conversion for legacy node-graph frames', () => {
    expect(relationsDataTransformations({ series: [rowEdges()] })).toEqual([legacyToWideOperator]);
  });

  /**
   * The ordering that matters: a long response *passes* the already-wide shape test, so
   * checking that first returned `[]` and left the panel reading one frame — a one-edge
   * graph — out of however many the query returned.
   */
  it('registers the pivot for a long response, not nothing', () => {
    const series = [longEdge('a', 'b'), longEdge('b', 'c')];

    expect(relationsDataTransformations({ series })).toEqual([longToWideOperator]);
  });

  it('registers exactly one converter, never both', () => {
    // A response cannot be both shapes, but a mixed one must still pick a single owner.
    for (const series of [[rowEdges()], [longEdge('a', 'b')], [rowEdges(), longEdge('a', 'b')]]) {
      expect(relationsDataTransformations({ series })).toHaveLength(1);
    }
  });

  it('registers nothing when a long series sits beside a frame that is already the edges frame', () => {
    const series = [wideEdges(), longEdge('c', 'd')];

    expect(relationsDataTransformations({ series })).toEqual([]);
  });

  it('registers nothing when the frames are already wide', () => {
    // A datasource that starts emitting the wide kind natively silently stops
    // triggering the conversion, with no dashboard change.
    expect(relationsDataTransformations({ series: [wideEdges()] })).toEqual([]);
  });

  it('registers nothing for frames that are not a graph at all', () => {
    const series = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1] },
        { name: 'value', type: FieldType.number, values: [2] },
      ],
    });

    expect(relationsDataTransformations({ series: [series] })).toEqual([]);
  });

  it('registers nothing for an empty response', () => {
    expect(relationsDataTransformations({ series: [] })).toEqual([]);
  });
});
