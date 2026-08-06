import { type DataFrame, FieldType, toDataFrame } from '@grafana/data';
import { act, render, screen } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { type SeriesType } from 'editor/types';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import { GRAPH_EDGES_WIDE, GRAPH_NODES_WIDE } from 'lib/echarts/converters/graphWide';
import { getChart } from 'test/canvas';
import { getComponent, waitForFinished } from 'test/panel';
import { type PanelOptions } from 'types';
import { TOOLTIP_MARKER_ATTR } from './constants';

/**
 * End-to-end cover for the pinned tooltip's data-link footer, driven through
 * zrender's real pointer pipeline so ECharts' own hit-testing and element
 * handlers run — the layer where these bugs actually lived. Each family resolves
 * a hovered item back to a source `Field` + row differently (see
 * `lib/echarts/tooltip/model`), and a mistake there is invisible to unit tests
 * on the model: the footer simply never renders.
 */

const LINK_TITLE = 'MyLink';

/**
 * Give `fieldName` a resolvable data link. Set directly on the field rather than
 * through a `links` field-config override: `applyFieldOverrides` resolves
 * override properties through Grafana's field-config registry, which plugins
 * cannot populate in tests (see `test/panel.tsx`).
 */
const withLink = (frame: DataFrame, fieldName: string, title = LINK_TITLE): DataFrame => {
  const field = frame.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`No field named ${fieldName}`);
  }
  field.config = { ...field.config, links: [{ title, url: 'http://example.com' }] };
  field.getLinks = () => [{ title, href: 'http://example.com', target: '_self', origin: field }];
  return frame;
};

/**
 * Dispatch through zrender's `Handler` (not the zr Eventful) so ECharts sees a
 * genuine pointer: it runs `findHover`, dispatches element events, and only
 * synthesizes `click` after a matching press/release pair.
 */
const dispatch = async (chart: EChartsType, type: string, x: number, y: number) => {
  await act(async () => {
    // ZRender's Handler is not part of the public typings.
    const handler = (chart.getZr() as unknown as { handler: { dispatch: (t: string, e: unknown) => void } }).handler;
    handler.dispatch(type, { zrX: x, zrY: y, offsetX: x, offsetY: y, preventDefault: () => undefined });
    // Let ECharts' tooltip timers and the hook's rAF flush settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};

const tooltipEl = () => document.querySelector<HTMLElement>(`[${TOOLTIP_MARKER_ATTR}]`);
const tooltipText = () => tooltipEl()?.textContent ?? '';

/** Emulate a browser click: zrender only synthesizes `click` after a press pair. */
const clickAt = async (chart: EChartsType, x: number, y: number) => {
  // The document-level mousedown is what dismisses a pinned tooltip, so it has
  // to fire too — re-pinning depends on the click rebuilding state afterwards.
  await act(async () => {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  await dispatch(chart, 'mousedown', x, y);
  await dispatch(chart, 'mouseup', x, y);
  await dispatch(chart, 'click', x, y);
};

/** Hover each candidate point until one lands on a chart item, then click to pin. */
const hoverAndPin = async (chart: EChartsType, points: Array<[number, number]>): Promise<readonly [number, number]> => {
  for (const [x, y] of points) {
    await dispatch(chart, 'mousemove', x, y);
    if (tooltipText() !== '') {
      await clickAt(chart, x, y);
      return [x, y] as const;
    }
  }
  throw new Error('No chart item was hoverable at any candidate point');
};

const renderPanel = async (
  frames: DataFrame[],
  seriesType: SeriesType,
  family: ChartFamily,
  options?: Partial<PanelOptions>
) => {
  const { container } = render(getComponent(frames, seriesType, options, undefined, undefined, family));
  const { chart } = getChart(container);
  await waitForFinished(chart);
  return chart!;
};

const categoryFrame = () =>
  withLink(
    toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
        { name: 'value', type: FieldType.number, values: [43, 10, 30] },
      ],
    }),
    'value'
  );

/** Two candidate points that hover *different* items, for re-pin coverage. */
const findTwoItems = async (chart: EChartsType, points: Array<[number, number]>) => {
  const found: Array<{ point: [number, number]; text: string }> = [];
  for (const point of points) {
    await dispatch(chart, 'mousemove', point[0], point[1]);
    const text = tooltipText();
    if (text !== '' && !found.some((entry) => entry.text === text)) {
      found.push({ point, text });
      if (found.length === 2) {
        return found;
      }
    }
  }
  throw new Error('Could not hover two distinct items');
};

describe('re-pinning', () => {
  it('moves an existing pin onto the newly clicked point, content and position', async () => {
    const chart = await renderPanel([categoryFrame()], 'treemap', 'hierarchy');
    const [first, second] = await findTwoItems(chart, [
      [60, 60],
      [200, 120],
      [330, 60],
      [330, 200],
      [60, 200],
    ]);

    await dispatch(chart, 'mousemove', first.point[0], first.point[1]);
    await clickAt(chart, first.point[0], first.point[1]);
    const pinnedText = tooltipText();
    const pinnedTransform = tooltipEl()?.style.transform;
    expect(pinnedText).toContain(first.text);

    // Click a different item while still pinned. Without re-pinning, a pinned
    // tooltip freezes both content and position, so it would keep describing —
    // and sit beside — the first point.
    await dispatch(chart, 'mousemove', second.point[0], second.point[1]);
    await clickAt(chart, second.point[0], second.point[1]);

    expect(tooltipText()).toContain(second.text);
    expect(tooltipEl()?.style.transform).not.toBe(pinnedTransform);
  });
});

describe('pinned tooltip data links', () => {
  it('resolves a treemap node back to its source row', async () => {
    const chart = await renderPanel([categoryFrame()], 'treemap', 'hierarchy');
    // Tiles fill the plot, so the centre always lands on one.
    await hoverAndPin(chart, [[200, 120]]);

    expect(screen.getByText(LINK_TITLE)).toBeInTheDocument();
  });

  it('resolves a pie slice back to its source row', async () => {
    const chart = await renderPanel([categoryFrame()], 'pie', 'part-to-whole', {
      reduceOptions: { calcs: [], values: true },
    });
    await hoverAndPin(chart, [
      [200, 100],
      [230, 110],
      [170, 90],
    ]);

    expect(screen.getByText(LINK_TITLE)).toBeInTheDocument();
  });

  it('resolves a matrix heatmap cell back to its own column field and row', async () => {
    const frame = withLink(
      toDataFrame({
        fields: [
          { name: 'Service', type: FieldType.string, values: ['API', 'Web'] },
          { name: 'Mon', type: FieldType.number, values: [12, 8] },
          // Only the second column carries the link, so a hit proves the cell
          // resolved its *own* column rather than the first.
          { name: 'Tue', type: FieldType.number, values: [19, 11] },
        ],
      }),
      'Tue'
    );
    const chart = await renderPanel([frame], 'heatmap', 'heatmap', { heatmapLayout: 'matrix' });
    // Right-hand column (Tue), scanning down for a cell.
    await hoverAndPin(chart, [
      [280, 80],
      [280, 140],
      [240, 80],
      [240, 140],
    ]);

    expect(screen.getByText(LINK_TITLE)).toBeInTheDocument();
  });

  /**
   * Relations, which had no case here at all until the field-based graph contract
   * gave it one worth writing — `todo/relations-data-links.md` gaps 1-3.
   *
   * Each assertion is the *negative* as much as the positive: a link configured on
   * node `a` must not appear on node `b`, and an edge must resolve the edge field
   * rather than either endpoint's. In the row form neither was expressible — one
   * `mainstat` column backed every mark, so a link on it painted on all of them.
   */
  describe('relations', () => {
    const NODE_LINK = 'NodeLink';
    const EDGE_LINK = 'EdgeLink';

    /**
     * Wide frames, written directly rather than converted: the row->field
     * transformation the plugin registers runs in the host's pipeline, which the
     * test harness does not have. Only `a` and `e2` carry a link.
     */
    const graphFrames = (): DataFrame[] => [
      withLink(
        toDataFrame({
          name: 'nodes',
          meta: { type: GRAPH_NODES_WIDE },
          fields: [
            { name: 'a', type: FieldType.number, values: [12] },
            { name: 'b', type: FieldType.number, values: [8] },
            { name: 'c', type: FieldType.number, values: [3] },
          ],
        }),
        'a',
        NODE_LINK
      ),
      withLink(
        toDataFrame({
          name: 'edges',
          meta: { type: GRAPH_EDGES_WIDE },
          fields: [
            { name: 'e1', type: FieldType.number, labels: { source: 'a', target: 'b' }, values: [5] },
            { name: 'e2', type: FieldType.number, labels: { source: 'b', target: 'c' }, values: [7] },
          ],
        }),
        'e2',
        EDGE_LINK
      ),
    ];

    /**
     * The rendered centre of a mark, read off the chart rather than guessed.
     * Scanning candidate points, as the cases above do, cannot say *which* mark was
     * hit — and that is the whole claim here.
     *
     * `getItemLayout` shape depends on the variant: a graph node is `[x, y]` and a
     * graph edge is its endpoint pair, while a sankey node is the `{x, y, dx, dy}`
     * rectangle the layout assigned it.
     */
    const markPoint = (chart: EChartsType, dataType: 'node' | 'edge', dataIndex: number): [number, number] => {
      // ECharts' model/data internals are not part of the public typings.
      const model = chart as unknown as {
        getModel: () => {
          getSeriesByIndex: (index: number) => {
            getData: (type?: string) => { getItemLayout: (i: number) => unknown };
          };
        };
      };
      const layout = model
        .getModel()
        .getSeriesByIndex(0)
        .getData(dataType === 'edge' ? 'edge' : undefined)
        .getItemLayout(dataIndex);
      if (Array.isArray(layout)) {
        const points: Array<number | [number, number]> = layout;
        const [first, second] = points;
        if (typeof first === 'number' && typeof second === 'number') {
          return [first, second];
        }
        const [[x1, y1], [x2, y2]] = [first, second] as Array<[number, number]>;
        return [(x1 + x2) / 2, (y1 + y2) / 2];
      }
      const rect = layout as { x: number; y: number; dx: number; dy: number };
      return [rect.x + rect.dx / 2, rect.y + rect.dy / 2];
    };

    const pinMark = async (chart: EChartsType, dataType: 'node' | 'edge', dataIndex: number) => {
      const [x, y] = markPoint(chart, dataType, dataIndex);
      await dispatch(chart, 'mousemove', x, y);
      expect(tooltipText()).not.toBe('');
      await clickAt(chart, x, y);
    };

    // Circular layout so node positions are deterministic (the force simulation is
    // not), and a wide symbol so the pointer lands inside it.
    const renderGraph = () =>
      renderPanel(graphFrames(), 'graph', 'relations', { relationsLayout: 'circular', relationsNodeSize: 30 });

    it('resolves a node back to its own field, and leaves the other nodes linkless', async () => {
      const chart = await renderGraph();

      await pinMark(chart, 'node', 0);
      expect(screen.getByText(NODE_LINK)).toBeInTheDocument();

      // Gap 1: in the row form the same `mainstat` column backs every node, so this
      // link would appear here too.
      await pinMark(chart, 'node', 1);
      expect(screen.queryByText(NODE_LINK)).not.toBeInTheDocument();
    });

    it('resolves an edge back to the edge’s own field, not an endpoint’s', async () => {
      const chart = await renderGraph();

      await pinMark(chart, 'edge', 1);
      expect(screen.getByText(EDGE_LINK)).toBeInTheDocument();
      // Gaps 2 and 3: the edge resolves neither the node frame's field nor the
      // other edge's.
      expect(screen.queryByText(NODE_LINK)).not.toBeInTheDocument();

      await pinMark(chart, 'edge', 0);
      expect(screen.queryByText(EDGE_LINK)).not.toBeInTheDocument();
    });

    it('carries the same resolution into the sankey variant', async () => {
      // Sankey lays the identical model out as ribbons and drops the `graph`-only
      // layout option, so this is the cheapest check that the wiring is per-family
      // rather than per-variant.
      const chart = await renderPanel(graphFrames(), 'sankey', 'relations');

      await pinMark(chart, 'node', 0);

      expect(screen.getByText(NODE_LINK)).toBeInTheDocument();
    });
  });

  it('resolves a binned heatmap cell back to its source field and row', async () => {
    // The default layout: cells are a custom series on continuous axes, a
    // different resolution path from the matrix layout above.
    const frame = withLink(
      toDataFrame({
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497] },
          { name: 'A', type: FieldType.number, values: [3, 5, 8] },
          { name: 'B', type: FieldType.number, values: [9, 4, 6] },
        ],
      }),
      'B'
    );
    const chart = await renderPanel([frame], 'heatmap', 'heatmap');
    await hoverAndPin(chart, [
      [200, 80],
      [200, 140],
      [120, 80],
      [120, 140],
      [280, 100],
    ]);

    expect(screen.getByText(LINK_TITLE)).toBeInTheDocument();
  });
});
