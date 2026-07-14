import { type DataFrame, DataFrameType, type Field, FieldType, toDataFrame } from '@grafana/data';
import { AxisPlacement } from '@grafana/schema';
import { render } from '@testing-library/react';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { AXIS_ZLEVEL, removeCanvasClear, SERIES_ZLEVEL } from 'test/canvas';
import { getAxisCanvasEvents, getCanvasEvents, getComponent, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Canvas integration tests focused on the y-axis. The axis is pushed onto its
// own zlevel (`zLevel.axis`) so its draw calls land on a dedicated canvas that
// can be snapshotted in isolation from the grid and series, keeping the
// committed snapshot small. The grid + series layers are handed to the compare
// viewer as context only. See `test/canvas.ts` and `test/panel`.

const zLevel = { series: SERIES_ZLEVEL, axis: AXIS_ZLEVEL };

/** Numeric field with an optional unit and per-field y-axis placement override. */
const numeric = (name: string, values: number[], unit?: string, placement?: AxisPlacement): Field => ({
  name,
  type: FieldType.number,
  values,
  config: {
    displayName: name,
    ...(unit ? { unit } : {}),
    ...(placement ? { custom: { axisPlacement: placement } } : {}),
  },
});

const time = (values: number[]): Field => ({ name: 'time', type: FieldType.time, values, config: {} });
const times = [1783137094497, 1783140694497, 1783144294497, 1783147894497];

describe('Panel canvas axis renders', () => {
  // The grid/axis layer for a plain single-axis time series. Committed as the
  // default (grid) layer; the series layer is viewer-only context. Moved here
  // from Panel.canvas.test.tsx so all grid/axis snapshots live together.
  it('grid', async () => {
    const frame = toDataFrame({
      fields: [time(times), numeric('cpu', [10, 20, 30, 10])],
    });

    const { container } = render(
      getComponent([frame], 'line', {
        zLevel: { series: SERIES_ZLEVEL },
        animation: { enabled: false },
      })
    );

    const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

    expect(removeCanvasTransforms(removeCanvasClear(defaultEvents))).toMatchCanvasSnapshot(seriesEvents, {
      width,
      height,
    });
  });

  // A single y-axis rendered by each axis-bearing chart family. Confirms every
  // renderer draws exactly one value/category axis on the dedicated axis layer.
  describe('single y-axis renderers', () => {
    const cartesianFrame = toDataFrame({ fields: [time(times), numeric('cpu', [10, 20, 30, 10])] });
    const categoryFrame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
        numeric('Budget', [43, 10, 30]),
      ],
    });
    const candlestickFrame = toDataFrame({
      name: 'BTC',
      fields: [
        time(times),
        numeric('open', [10, 18, 22, 15]),
        numeric('high', [20, 25, 28, 24]),
        numeric('low', [5, 12, 18, 11]),
        numeric('close', [18, 22, 15, 21]),
      ],
    });
    const heatmapRowsFrame = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [time(times), numeric('low', [5, 6, 7, 8]), numeric('high', [9, 10, 11, 12])],
    });
    const matrixFrame = toDataFrame({
      fields: [
        { name: 'row', type: FieldType.string, values: ['a', 'b', 'c'] },
        numeric('c1', [1, 5, 9]),
        numeric('c2', [3, 7, 2]),
      ],
    });

    const cases: Array<{ name: string; frames: DataFrame[]; seriesType: SeriesType; options?: Partial<PanelOptions> }> =
      [
        { name: 'time (line)', frames: [cartesianFrame], seriesType: 'line' },
        { name: 'category (bar)', frames: [categoryFrame], seriesType: 'bar' },
        { name: 'multi-value (candlestick)', frames: [candlestickFrame], seriesType: 'candlestick' },
        { name: 'heatmap (binned)', frames: [heatmapRowsFrame], seriesType: 'heatmap' },
        {
          name: 'heatmap (matrix)',
          frames: [matrixFrame],
          seriesType: 'heatmap',
          options: { heatmapLayout: 'matrix' },
        },
      ];

    it.each(cases)('$name', async ({ frames, seriesType, options }) => {
      const { container } = render(
        getComponent(frames, seriesType, { zLevel, animation: { enabled: false }, ...options })
      );

      const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

      // Commit the isolated axis layer; grid + series are viewer-only context.
      expect(removeCanvasTransforms(removeCanvasClear(axisEvents))).toMatchCanvasSnapshot(
        [...defaultEvents, ...seriesEvents],
        { width, height }
      );
    });
  });

  // Two series with distinct units get one y-axis each; the per-field
  // `axisPlacement` override decides the side (or hides the axis). Verifies the
  // Phase 2 multi-axis layout across the placement combinations.
  describe('two y-axis placements', () => {
    const twoSeriesFrame = (placementA?: AxisPlacement, placementB?: AxisPlacement) =>
      toDataFrame({
        fields: [
          time(times),
          numeric('bytesSeries', [10, 20, 30, 10], 'bytes', placementA),
          numeric('percentSeries', [40, 55, 45, 60], 'percent', placementB),
        ],
      });

    const cases: Array<{ name: string; a?: AxisPlacement; b?: AxisPlacement }> = [
      { name: 'left-right', a: AxisPlacement.Left, b: AxisPlacement.Right },
      { name: 'left-left', a: AxisPlacement.Left, b: AxisPlacement.Left },
      { name: 'right-right', a: AxisPlacement.Right, b: AxisPlacement.Right },
      { name: 'left-hidden', a: AxisPlacement.Left, b: AxisPlacement.Hidden },
      { name: 'hidden-hidden', a: AxisPlacement.Hidden, b: AxisPlacement.Hidden },
    ];

    it.each(cases)('$name', async ({ a, b }) => {
      const { container } = render(
        getComponent([twoSeriesFrame(a, b)], 'line', { zLevel, animation: { enabled: false } })
      );

      const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

      expect(removeCanvasTransforms(removeCanvasClear(axisEvents))).toMatchCanvasSnapshot(
        [...defaultEvents, ...seriesEvents],
        { width, height }
      );
    });
  });

  // Three distinct units placed left-left-right: two stacked (offset) left axes
  // and one right axis.
  it('three y-axes (left-left-right)', async () => {
    const frame = toDataFrame({
      fields: [
        time(times),
        numeric('bytesSeries', [10, 20, 30, 10], 'bytes', AxisPlacement.Left),
        numeric('wattSeries', [5, 6, 7, 8], 'watt', AxisPlacement.Left),
        numeric('percentSeries', [40, 55, 45, 60], 'percent', AxisPlacement.Right),
      ],
    });

    const { container } = render(getComponent([frame], 'line', { zLevel, animation: { enabled: false } }));

    const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

    expect(removeCanvasTransforms(removeCanvasClear(axisEvents))).toMatchCanvasSnapshot(
      [...defaultEvents, ...seriesEvents],
      { width, height }
    );
  });
});
