import { type DataFrame, DataFrameType, FieldType, toDataFrame } from '@grafana/data';

import { deriveNodesOperator } from 'lib/echarts/relations/converters/deriveNodes';

import { legacyToWideOperator } from 'lib/echarts/relations/converters/legacyToWide';
import { longToWideOperator } from 'lib/echarts/relations/converters/longToWide';
import { relationsDataTransformations } from './dataTransformations';

import { GRAPH_EDGES_WIDE } from 'lib/echarts/relations/converters/contract';
const rowEdges = (): DataFrame =>
  toDataFrame({
    fields: [
      { name: 'id', type: FieldType.string, values: ['e1'] },
      { name: 'source', type: FieldType.string, values: ['a'] },
      { name: 'target', type: FieldType.string, values: ['b'] },
      { name: 'mainstat', type: FieldType.number, values: [10] },
    ],
  });

/** Build one long data-source frame, such as a Prometheus series. */
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

const instantRows = (): DataFrame =>
  toDataFrame({
    meta: { type: DataFrameType.NumericLong },
    fields: [
      { name: 'Time', type: FieldType.time, values: [1700000000000] },
      { name: 'source', type: FieldType.string, values: ['a'] },
      { name: 'target', type: FieldType.string, values: ['b'] },
      { name: 'Value #A', type: FieldType.number, values: [10] },
    ],
  });

describe('relationsDataTransformations', () => {
  it('registers the conversion for legacy node-graph frames', () => {
    expect(relationsDataTransformations({ series: [rowEdges()] })).toEqual([legacyToWideOperator, deriveNodesOperator]);
  });

  it('registers the row conversion for a numeric-long instant response', () => {
    expect(relationsDataTransformations({ series: [instantRows()] })).toEqual([
      legacyToWideOperator,
      deriveNodesOperator,
    ]);
  });

  it('registers the pivot for a long response, not nothing', () => {
    const series = [longEdge('a', 'b'), longEdge('b', 'c')];

    expect(relationsDataTransformations({ series })).toEqual([longToWideOperator, deriveNodesOperator]);
  });

  it('registers exactly one converter, never both', () => {
    for (const series of [[rowEdges()], [longEdge('a', 'b')], [rowEdges(), longEdge('a', 'b')]]) {
      const registered = relationsDataTransformations({ series }) ?? [];

      expect(registered.filter((entry) => entry !== deriveNodesOperator)).toHaveLength(1);
    }
  });

  it('still derives nodes when a long series sits beside a frame that is already the edges frame', () => {
    const series = [wideEdges(), longEdge('c', 'd')];

    expect(relationsDataTransformations({ series })).toEqual([deriveNodesOperator]);
  });

  it('reshapes nothing when the frames are already wide, but still derives their nodes', () => {
    expect(relationsDataTransformations({ series: [wideEdges()] })).toEqual([deriveNodesOperator]);
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
