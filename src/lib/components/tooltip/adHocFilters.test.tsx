import { type DataFrame, type FieldConfigSource, FieldType, toDataFrame } from '@grafana/data';
import { fireEvent, screen } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { clickAt, dispatch, markPoint, renderTooltipPanel, tooltipText } from 'test/tooltipPointer';

/**
 * End-to-end cover for the pinned tooltip's **ad-hoc filter** footer, driven through
 * zrender's real pointer pipeline.
 *
 * Every bug this suite exists for lived in the *composition* rather than in any one
 * function, which is why unit tests on the model and on the overlay both stayed green
 * while a browser showed no filters at all:
 *
 * - the `filterable` gate was applied in the overlay, which can only ask the **hovered
 *   mark's** field — and a node the response only implied has none, so an edges-only
 *   service graph offered filters on every link and none on any node;
 * - a node asserted the **source** key whatever its place in the topology, so a
 *   destination-only service filtered on `source="…"`, a key it never appears under. The
 *   dashboard showed one button that emptied it and one that did nothing.
 *
 * So the input here is a pointer and the assertion is what `onAddAdHocFilter` receives.
 */

/** Filterable panel-wide, as the Fields tab's **Filterable** switch writes it. */
const filterablePanel: FieldConfigSource = { defaults: { filterable: true }, overrides: [] };
/** Nothing opts in — the default, and the "don't offer what cannot work" case. */
const plainPanel: FieldConfigSource = { defaults: {}, overrides: [] };

/**
 * A chain `a → b → c`, **edges only**, so every node is derived: no nodes frame reached
 * the panel, which is the normal shape for a Prometheus or Loki service graph (see
 * `docs/relations-derived-nodes.md`). It gives one node per role — `a` is only ever a
 * source, `b` is both, `c` is only ever a target.
 */
const chainEdges = (): DataFrame[] => [
  toDataFrame({
    name: 'edges',
    meta: { type: GRAPH_EDGES_WIDE },
    fields: [
      { name: 'a-b', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [5] },
      { name: 'b-c', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [7] },
    ],
  }),
];

/** The same chain with its nodes declared, so a node has a field of its own. */
const chainWithNodes = (): DataFrame[] => [
  toDataFrame({
    name: 'nodes',
    meta: { type: GRAPH_NODES_WIDE },
    fields: [
      { name: 'a', type: FieldType.number, values: [12] },
      { name: 'b', type: FieldType.number, values: [8] },
      { name: 'c', type: FieldType.number, values: [3] },
    ],
  }),
  ...chainEdges(),
];

// Circular layout so node positions are deterministic (the force simulation is not), and a
// wide symbol so the pointer lands inside it. Animation off because the family defaults it
// *on* and `waitForFinished` would otherwise wait out the whole load animation.
const graphOptions = {
  animation: { enabled: false },
  relationsLayout: 'circular' as const,
  relationsNodeSize: 30,
};

const renderGraph = (frames: DataFrame[], fieldConfig: FieldConfigSource, onAddAdHocFilter = jest.fn()) => ({
  onAddAdHocFilter,
  chart: renderTooltipPanel({
    frames,
    seriesType: 'graph',
    family: 'relations',
    options: graphOptions,
    fieldConfig,
    panelContext: { onAddAdHocFilter },
  }),
});

/**
 * Pin the mark at `dataIndex`, asserting the pinned tooltip really is that mark's — every
 * expectation below is about *which* mark answered, so the wrong hit has to fail loudly.
 *
 * Checked after the click rather than before: while a tooltip is pinned a hover leaves its
 * content alone, so a second `pinMark` in one test would otherwise assert the first mark's
 * text.
 */
const pinMark = async (chart: EChartsType, dataType: 'node' | 'edge', dataIndex: number, name: string) => {
  const [x, y] = markPoint(chart, dataType, dataIndex);
  await dispatch(chart, 'mousemove', x, y);
  await clickAt(chart, x, y);
  expect(tooltipText()).toContain(name);
};

const filterFor = () => screen.getByRole('button', { name: /Filter on this value/i });
const filterOut = () => screen.getByRole('button', { name: /Filter out this value/i });

describe('pinned tooltip ad-hoc filters', () => {
  /**
   * **The regression.** Gating on the hovered mark's own field left every node of an
   * edges-only response with no filters, because a derived node has no field to carry
   * `filterable`. Its opt-in comes from the edges that named it (`markFilterable`), which
   * is also where the endpoint keys come from.
   */
  it('offers filters on a node the response only implied', async () => {
    const { chart: pending, onAddAdHocFilter } = renderGraph(chainEdges(), filterablePanel);
    const chart = await pending;

    await pinMark(chart, 'node', 0, 'a');

    fireEvent.click(filterFor());
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'source', value: 'a', operator: '=' });
  });

  /**
   * **The second regression.** `c` is a pure destination — `warpstream-agent-write` on the
   * live service graph — so `source="c"` matches no series at all, and no filter-label
   * mapping can fix it: the key was right and the direction was wrong. The direction is a
   * property of the topology, so it is read off the edges touching the node
   * (`toNodeFilterLabels`).
   */
  it('asserts the target key for a destination-only node', async () => {
    const { chart: pending, onAddAdHocFilter } = renderGraph(chainEdges(), filterablePanel);
    const chart = await pending;

    await pinMark(chart, 'node', 2, 'c');

    fireEvent.click(filterFor());
    expect(onAddAdHocFilter).toHaveBeenCalledTimes(1);
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'target', value: 'c', operator: '=' });

    // The negation still covers the role it does not play, filled from the far end of the
    // pair it sits on: a `topk` re-ranks the moment the filter applies, and `c` would
    // otherwise reappear as a source. See `NodeFilterLabels.negate`.
    onAddAdHocFilter.mockClear();
    fireEvent.click(filterOut());
    expect(onAddAdHocFilter).toHaveBeenCalledTimes(2);
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'source', value: 'c', operator: '!=' });
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'target', value: 'c', operator: '!=' });
  });

  /**
   * A node in the middle keeps the asymmetry: it asserts its outgoing edges, because
   * `source=b AND target=b` is self-loops, and negates both — "everything that does not
   * touch this node".
   */
  it('negates both directions of a node in the middle of the chain', async () => {
    const { chart: pending, onAddAdHocFilter } = renderGraph(chainEdges(), filterablePanel);
    const chart = await pending;

    await pinMark(chart, 'node', 1, 'b');

    fireEvent.click(filterFor());
    expect(onAddAdHocFilter).toHaveBeenCalledTimes(1);
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'source', value: 'b', operator: '=' });

    onAddAdHocFilter.mockClear();
    fireEvent.click(filterOut());
    expect(onAddAdHocFilter).toHaveBeenNthCalledWith(1, { key: 'source', value: 'b', operator: '!=' });
    expect(onAddAdHocFilter).toHaveBeenNthCalledWith(2, { key: 'target', value: 'b', operator: '!=' });
  });

  /** An edge **is** the conjunction of its endpoints, so both go in, both ways. */
  it('narrows to exactly one edge from its own tooltip', async () => {
    const { chart: pending, onAddAdHocFilter } = renderGraph(chainEdges(), filterablePanel);
    const chart = await pending;

    await pinMark(chart, 'edge', 1, 'b → c');

    fireEvent.click(filterFor());
    expect(onAddAdHocFilter).toHaveBeenNthCalledWith(1, { key: 'source', value: 'b', operator: '=' });
    expect(onAddAdHocFilter).toHaveBeenNthCalledWith(2, { key: 'target', value: 'c', operator: '=' });
  });

  /**
   * **The gate**, end to end: `filterable` is what core checks before offering the same
   * buttons on a table cell, and a filter written under a key the datasource does not
   * carry either does nothing or empties the dashboard.
   */
  it('offers no filter button at all when nothing is filterable', async () => {
    const { chart: pending } = renderGraph(chainWithNodes(), plainPanel);
    const chart = await pending;

    await pinMark(chart, 'node', 1, 'b');
    expect(screen.queryByRole('button', { name: /Filter/i })).not.toBeInTheDocument();

    await pinMark(chart, 'edge', 0, 'a → b');
    expect(screen.queryByRole('button', { name: /Filter/i })).not.toBeInTheDocument();
  });

  /**
   * A declared node answers with its **own** field, so a `byType` override that opts the
   * numbers in reaches it — and the same panel's marks stay independent of each other.
   */
  it('offers filters on a declared node too', async () => {
    const { chart: pending, onAddAdHocFilter } = renderGraph(chainWithNodes(), filterablePanel);
    const chart = await pending;

    await pinMark(chart, 'node', 2, 'c');

    fireEvent.click(filterFor());
    expect(onAddAdHocFilter).toHaveBeenCalledWith({ key: 'target', value: 'c', operator: '=' });
  });
});
