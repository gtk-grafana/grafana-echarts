import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';

import { deriveNodesOperator } from 'lib/echarts/converters/deriveNodes';
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
    expect(relationsDataTransformations({ series: [rowEdges()] })).toEqual([legacyToWideOperator, deriveNodesOperator]);
  });

  /**
   * The ordering that matters: a long response *passes* the already-wide shape test, so
   * checking that first would return `[]`. The reader draws every edge either way now —
   * what the pivot adds is **identity**: one real `field.name` per edge, i.e. an override
   * target, a picker entry and a `byName` match. Flipping the order would trade N override
   * targets for zero.
   */
  it('registers the pivot for a long response, not nothing', () => {
    const series = [longEdge('a', 'b'), longEdge('b', 'c')];

    expect(relationsDataTransformations({ series })).toEqual([longToWideOperator, deriveNodesOperator]);
  });

  it('registers exactly one converter, never both', () => {
    // A response cannot be both shapes, but a mixed one must still pick a single owner.
    // The node derivation rides along with whichever wins and is not one of the two.
    for (const series of [[rowEdges()], [longEdge('a', 'b')], [rowEdges(), longEdge('a', 'b')]]) {
      const registered = relationsDataTransformations({ series }) ?? [];

      expect(registered.filter((entry) => entry !== deriveNodesOperator)).toHaveLength(1);
    }
  });

  /**
   * The pivot declines — something else is already the edges frame — but the response is
   * still a graph, and still one whose nodes exist only as endpoints. Returning `[]` here
   * would leave exactly the case the derivation exists for uncovered.
   */
  it('still derives nodes when a long series sits beside a frame that is already the edges frame', () => {
    const series = [wideEdges(), longEdge('c', 'd')];

    expect(relationsDataTransformations({ series })).toEqual([deriveNodesOperator]);
  });

  it('reshapes nothing when the frames are already wide, but still derives their nodes', () => {
    // A datasource that starts emitting the wide kind natively silently stops
    // triggering the conversion, with no dashboard change. The derivation stays: an
    // edges-only wide response is exactly the shape whose nodes are all implied, and it
    // returns the frames by reference when there is nothing to add.
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
