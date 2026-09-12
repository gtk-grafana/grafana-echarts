import { DataFrameType, FieldType, ReducerID, toDataFrame } from '@grafana/data';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { renderRelations, uniqueLabelTexts } from 'test/relationsCanvas';

/**
 * What a relations label actually *says*: the reducer that turned a series into one
 * number, and the unit and decimals that formatted it.
 *
 * Both are Default-tier settings that reach the canvas through the same route — the
 * mark's own display processor, shared with the tooltip (`getRelationsNodeLabelFormatter`)
 * — and neither moves anything. **No baselines here, by construction**, the way
 * `relations-labels` states it: every claim below is the list of strings the panel
 * painted, which a 2,500-line picture would state worse while burying it. The geometry
 * these values are drawn *at* is pinned in `relations-graph.canvas.test.tsx`
 * ("node values on"), and read off the `fillText` calls either way.
 *
 * Every case turns "Show node values" and "Show edge values" on, because a label is the
 * only place a reduced value is visible on a canvas at all.
 */

const T0 = 1700000000000;
const STEP = 300000;

/** Three rows per mark, so the reducer has something to choose between. */
const rangedNodes = () =>
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
      { name: 'gateway', type: FieldType.number, values: [10, 90, 20] },
      { name: 'api', type: FieldType.number, values: [5, 50, 15] },
    ],
  });

const rangedEdges = () =>
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'Time', type: FieldType.time, values: [T0, T0 + STEP, T0 + 2 * STEP] },
      { name: 'gateway-->api', type: FieldType.number, values: [1, 7, 3] },
    ],
  });

const showValues = { relationsShowNodeValues: true, relationsShowEdgeValues: true };

describe('relations values', () => {
  describe('reducer', () => {
    /**
     * `RELATIONS_CALC_DEFAULT` — the last non-null row, which for these fixtures is the
     * third one. Pinned as the pair with the case below: on its own, "20 / 15 / 3" says
     * nothing about *which* reducer produced it.
     */
    it('no calcs reduces every mark to its last value', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [rangedNodes(), rangedEdges()],
        options: showValues,
      });

      expect(uniqueLabelTexts(seriesEvents)).toEqual(['15', '20', '3', 'api', 'gateway']);
    });

    // The same frames read with `max`, which is the middle row for all three marks — so
    // every drawn number changes and nothing else about the render does.
    it('calcs max reduces every mark to its largest value', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [rangedNodes(), rangedEdges()],
        options: { ...showValues, reduceOptions: { calcs: [ReducerID.max] } },
      });

      expect(uniqueLabelTexts(seriesEvents)).toEqual(['50', '7', '90', 'api', 'gateway']);
    });

    /**
     * A second calc is ignored rather than drawn: a mark is one number, and the label has
     * room for one. See `normalizeRelationsCalcs` — the extra calcs are the tooltip's.
     */
    it('a second calc leaves the label on the first', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [rangedNodes(), rangedEdges()],
        options: { ...showValues, reduceOptions: { calcs: [ReducerID.max, ReducerID.min] } },
      });

      expect(uniqueLabelTexts(seriesEvents)).toEqual(['50', '7', '90', 'api', 'gateway']);
    });
  });

  describe('formatting', () => {
    /**
     * Unit and decimals are standard field config, so they reach a relations mark the way
     * they reach any other field — and the label has to print the *formatted* value, not
     * the raw one, or a node's label and its own tooltip row would disagree.
     */
    it('a unit and decimals from the field config format every value drawn', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [rangedNodes(), rangedEdges()],
        options: showValues,
        fieldConfig: { defaults: { unit: 'ms', decimals: 1 }, overrides: [] },
      });

      expect(uniqueLabelTexts(seriesEvents)).toEqual(['15.0 ms', '20.0 ms', '3.0 ms', 'api', 'gateway']);
    });

    /** The same formatting addressed to one mark, which is what an override is for. */
    it('a byName unit override formats only the node it names', async () => {
      const { seriesEvents } = await renderRelations({
        frames: [rangedNodes(), rangedEdges()],
        options: showValues,
        fieldConfig: {
          defaults: {},
          overrides: [
            {
              matcher: { id: 'byName', options: 'gateway' },
              properties: [
                { id: 'unit', value: 'percent' },
                { id: 'decimals', value: 2 },
              ],
            },
          ],
        },
      });

      expect(uniqueLabelTexts(seriesEvents)).toEqual(['15', '20.00%', '3', 'api', 'gateway']);
    });
  });

  /**
   * An instant frame — one row, no reduction to do — which is the shape a service graph
   * really returns and the one the time slider's fixtures use. The reducer must not turn
   * a single row into nothing.
   */
  it('an instant frame draws its one row whatever the reducer', async () => {
    const instant = () =>
      toDataFrame({
        name: 'nodes',
        meta: { type: DataFrameType.NumericMulti },
        fields: [
          { name: 'Time', type: FieldType.time, values: [T0] },
          { name: 'gateway', type: FieldType.number, values: [42] },
          { name: 'api', type: FieldType.number, values: [7] },
        ],
      });
    const { seriesEvents } = await renderRelations({
      frames: [instant(), rangedEdges()],
      options: { ...showValues, reduceOptions: { calcs: [ReducerID.max] } },
    });

    expect(uniqueLabelTexts(seriesEvents)).toEqual(['42', '7', 'api', 'gateway']);
  });
});
