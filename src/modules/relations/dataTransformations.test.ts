import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/converters/graphWide';
import { legacyToWideOperator } from 'lib/echarts/converters/legacyToWide';
import { relationsDataTransformations } from './dataTransformations';

const longEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1'] },
      { name: 'source', type: FieldType.string, values: ['a'] },
      { name: 'target', type: FieldType.string, values: ['b'] },
      { name: 'mainstat', type: FieldType.number, values: [10] },
    ],
  });

const wideEdges = (): DataFrame =>
  toDataFrame({
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [{ name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [10] }],
  });

describe('relationsDataTransformations', () => {
  it('registers the conversion for legacy node-graph frames', () => {
    expect(relationsDataTransformations({ series: [longEdges()] })).toEqual([legacyToWideOperator]);
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
