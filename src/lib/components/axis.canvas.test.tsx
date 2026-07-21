import { type DataFrame, DataFrameType, type Field, FieldType, toDataFrame } from '@grafana/data';
import { AxisPlacement } from '@grafana/schema';
import { render } from '@testing-library/react';
import { type SeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { AXIS_ZLEVEL, removeCanvasClear, roundCanvasEvents, SERIES_ZLEVEL } from 'test/canvas';
import { getAxisCanvasEvents, getCanvasEvents, getComponent, height, width } from 'test/panel';
import { type PanelOptions } from 'types';

// Canvas integration tests focused on the y-axis. The axis is pushed onto its
// own zlevel (`zLevel.axis`) so its draw calls land on a dedicated canvas that
// can be snapshotted in isolation from the grid and series, keeping the
// committed snapshot small. The grid + series layers are handed to the compare
// viewer as context only. See `test/canvas.ts` and `test/panel`.

const zLevel = { series: SERIES_ZLEVEL, axis: AXIS_ZLEVEL };

/** Numeric field with an optional unit and per-field y-axis placement override. */
const generateNumberField = (name: string, values: number[], unit?: string, placement?: AxisPlacement): Field => ({
  name,
  type: FieldType.number,
  values,
  config: {
    displayName: name,
    ...(unit ? { unit } : {}),
    ...(placement ? { custom: { axisPlacement: placement } } : {}),
  },
});

/** Numeric field carrying explicit standard Min/Max axis bounds. */
const generateBoundedField = (name: string, values: number[], min?: number, max?: number): Field => ({
  name,
  type: FieldType.number,
  values,
  config: { displayName: name, min, max },
});

const generateTimeField = (values: number[]): Field => ({ name: 'time', type: FieldType.time, values, config: {} });
const times = [1783137094497, 1783140694497, 1783144294497, 1783147894497];

describe('Panel canvas axis renders', () => {
  // The grid/axis layer for a plain single-axis time series. Committed as the
  // default (grid) layer; the series layer is viewer-only context. Moved here
  // from Panel.canvas.test.tsx so all grid/axis snapshots live together.
  it('grid', async () => {
    const frame = toDataFrame({
      fields: [generateTimeField(times), generateNumberField('cpu', [10, 20, 30, 10])],
    });

    const { container } = render(
      getComponent([frame], 'line', {
        zLevel: { series: SERIES_ZLEVEL },
        animation: { enabled: false },
      })
    );

    const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

    expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(defaultEvents)))).toMatchCanvasSnapshot(
      seriesEvents,
      {
        width,
        height,
      }
    );
  });

  // A single y-axis rendered by each axis-bearing chart family. Confirms every
  // renderer draws exactly one value/category axis on the dedicated axis layer.
  describe('single y-axis renderers', () => {
    const cartesianFrame = toDataFrame({
      fields: [generateTimeField(times), generateNumberField('cpu', [10, 20, 30, 10])],
    });
    const categoryFrame = toDataFrame({
      fields: [
        { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
        generateNumberField('Budget', [43, 10, 30]),
      ],
    });
    const candlestickFrame = toDataFrame({
      name: 'BTC',
      fields: [
        generateTimeField(times),
        generateNumberField('open', [10, 18, 22, 15]),
        generateNumberField('high', [20, 25, 28, 24]),
        generateNumberField('low', [5, 12, 18, 11]),
        generateNumberField('close', [18, 22, 15, 21]),
      ],
    });
    const heatmapRowsFrame = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        generateTimeField(times),
        generateNumberField('low', [5, 6, 7, 8]),
        generateNumberField('high', [9, 10, 11, 12]),
      ],
    });
    const matrixFrame = toDataFrame({
      fields: [
        { name: 'row', type: FieldType.string, values: ['a', 'b', 'c'] },
        generateNumberField('c1', [1, 5, 9]),
        generateNumberField('c2', [3, 7, 2]),
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
      expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(axisEvents)))).toMatchCanvasSnapshot(
        [...defaultEvents, ...seriesEvents],
        { width, height }
      );
    });
  });

  // Explicit standard Min/Max options pin the value axis bounds; the axis ticks
  // and grid lines are laid out to those bounds instead of ECharts' data-fit
  // scale. Snapshots the axis layer to catch regressions in the min/max wiring.
  it('value axis honors explicit Min/Max bounds', async () => {
    const frame = toDataFrame({
      fields: [generateTimeField(times), generateBoundedField('cpu', [10, 20, 30, 10], 0, 100)],
    });

    const { container } = render(getComponent([frame], 'line', { zLevel, animation: { enabled: false } }));

    const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

    expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(axisEvents)))).toMatchCanvasSnapshot(
      [...defaultEvents, ...seriesEvents],
      { width, height }
    );
  });

  // Two series with distinct units get one y-axis each; the per-field
  // `axisPlacement` override decides the side (or hides the axis). Verifies the
  // Phase 2 multi-axis layout across the placement combinations.
  describe('two y-axis placements', () => {
    const twoSeriesFrame = (placementA?: AxisPlacement, placementB?: AxisPlacement) =>
      toDataFrame({
        fields: [
          generateTimeField(times),
          generateNumberField('bytesSeries', [10, 20, 30, 10], 'bytes', placementA),
          generateNumberField('percentSeries', [40, 55, 45, 60], 'percent', placementB),
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

      expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(axisEvents)))).toMatchCanvasSnapshot(
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
        generateTimeField(times),
        generateNumberField('bytesSeries', [10, 20, 30, 10], 'bytes', AxisPlacement.Left),
        generateNumberField('wattSeries', [5, 6, 7, 8], 'watt', AxisPlacement.Left),
        generateNumberField('percentSeries', [40, 55, 45, 60], 'percent', AxisPlacement.Right),
      ],
    });

    const { container } = render(getComponent([frame], 'line', { zLevel, animation: { enabled: false } }));

    const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

    expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(axisEvents)))).toMatchCanvasSnapshot(
      [...defaultEvents, ...seriesEvents],
      { width, height }
    );
  });

  // A binned heatmap with cartesian overlays: the bucket axis stays on the left
  // while one value axis per overlay unit stacks on the right (defaulting to the
  // right so they clear the bucket axis). See `buildBinnedHeatmapOption`.
  describe('heatmap overlay y-axes', () => {
    const heatmapCells = toDataFrame({
      meta: { type: DataFrameType.HeatmapRows },
      fields: [
        generateTimeField(times),
        generateNumberField('low', [5, 6, 7, 8]),
        generateNumberField('high', [9, 10, 11, 12]),
      ],
    });

    // Two overlay fields with distinct units, promoted to cartesian overlays via
    // the per-field `seriesType` override. An optional placement on the percent
    // field exercises the hidden-axis path.
    const overlayFrame = (percentPlacement?: AxisPlacement) =>
      toDataFrame({
        fields: [
          generateTimeField(times),
          {
            name: 'bytesOverlay',
            type: FieldType.number,
            values: [10, 20, 30, 10],
            config: { unit: 'bytes', custom: { seriesType: 'line' } },
          },
          {
            name: 'percentOverlay',
            type: FieldType.number,
            values: [40, 55, 45, 60],
            config: {
              unit: 'percent',
              custom: { seriesType: 'line', ...(percentPlacement ? { axisPlacement: percentPlacement } : {}) },
            },
          },
        ],
      });

    const cases: Array<{ name: string; percentPlacement?: AxisPlacement }> = [
      { name: 'two units (right-right)' },
      { name: 'unit hidden', percentPlacement: AxisPlacement.Hidden },
    ];

    it.each(cases)('$name', async ({ percentPlacement }) => {
      const { container } = render(
        getComponent([heatmapCells, overlayFrame(percentPlacement)], 'heatmap', {
          zLevel,
          animation: { enabled: false },
        })
      );

      const { defaultEvents, seriesEvents, axisEvents } = await getAxisCanvasEvents(container);

      expect(roundCanvasEvents(removeCanvasTransforms(removeCanvasClear(axisEvents)))).toMatchCanvasSnapshot(
        [...defaultEvents, ...seriesEvents],
        { width, height }
      );
    });
  });
});
