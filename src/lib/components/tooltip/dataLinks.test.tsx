import { type DataFrame, type Field, FieldType, type LinkModel, toDataFrame } from '@grafana/data';
import { act, render, screen } from '@testing-library/react';
import { type EChartsType } from 'echarts';
import { type ChartFamily } from 'lib/echarts/charts/autoSeriesType';
import { type SeriesType } from 'editor/types';
import { getChart } from 'test/canvas';
import { getComponent, waitForFinished } from 'test/panel';
import { type PanelOptions } from 'types';
import { TOOLTIP_MARKER_ATTR } from './useEChartsTooltip';

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
const withLink = (frame: DataFrame, fieldName: string): DataFrame => {
  const field = frame.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`No field named ${fieldName}`);
  }
  field.config = { ...field.config, links: [{ title: LINK_TITLE, url: 'http://example.com' }] };
  field.getLinks = () => [
    { title: LINK_TITLE, href: 'http://example.com', target: '_self', origin: field } as LinkModel<Field>,
  ];
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

const tooltipText = () => document.querySelector(`[${TOOLTIP_MARKER_ATTR}]`)?.textContent ?? '';

/** Hover each candidate point until one lands on a chart item, then click to pin. */
const hoverAndPin = async (chart: EChartsType, points: Array<[number, number]>) => {
  for (const [x, y] of points) {
    await dispatch(chart, 'mousemove', x, y);
    if (tooltipText() !== '') {
      await dispatch(chart, 'mousedown', x, y);
      await dispatch(chart, 'mouseup', x, y);
      await dispatch(chart, 'click', x, y);
      return;
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
