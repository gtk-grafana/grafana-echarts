import { DataFrameType, FieldType, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { cartesianTimeSeriesTypes } from 'editor/constants';
import { type CartesianSingleValueSeriesType } from 'editor/types';
import { removeCanvasTransforms } from 'jest-canvas-mock-compare';
import { removeCanvasClear, SERIES_ZLEVEL } from 'test/canvas';
import { getCanvasEvents, getComponent, height, width } from 'test/panel';

// Integration test: render the real <Panel /> (React glue + ECharts init +
// buildPanelChartOption) into a jest-canvas-mock canvas and snapshot the emitted
// draw calls. This exercises the full component path.
//
// Only the series-layer draw calls are committed; the noisier grid/axis layer is
// passed as viewer-only context (local jest-canvas-mock-compare payload, kept out
// of the repo) so the committed snapshot stays small. The layered capture merges
// the series onto their own zlevel and settles with animation off, so the result
// is deterministic. Shared render helpers live in `test/panel`; the grid/axis
// snapshots live in `axis.canvas.test.tsx`. See `test/canvas.ts`.

describe('Panel canvas renders', () => {
  describe('cartesian', () => {
    const frame = toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
        { name: 'cpu', type: FieldType.number, values: [10, 20, 30, 10], config: { displayName: 'cpu' } },
      ],
    });

    describe('renders default', () => {
      it.each(cartesianTimeSeriesTypes)('%s series', async (seriesType) => {
        const { container } = render(
          getComponent([frame], seriesType, {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );
        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    describe('bar', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
          { name: 'Budget', type: FieldType.number, values: [43, 10, 30], config: { displayName: 'Budget' } },
          { name: 'Actual', type: FieldType.number, values: [50, 14, 28], config: { displayName: 'Actual' } },
        ],
      });
      it('stacking', async () => {
        const { container } = render(
          getComponent([frame], 'bar', {
            stackSeries: true,
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    describe('candlestick', () => {
      // OHLC frame: fields resolved by name convention into [open, close, low, high].
      const frame = toDataFrame({
        name: 'BTC',
        fields: [
          { name: 'time', type: FieldType.time, values: [1783137094497, 1783140694497, 1783144294497, 1783147894497] },
          { name: 'open', type: FieldType.number, values: [10, 18, 22, 15] },
          { name: 'high', type: FieldType.number, values: [20, 25, 28, 24] },
          { name: 'low', type: FieldType.number, values: [5, 12, 18, 11] },
          { name: 'close', type: FieldType.number, values: [18, 22, 15, 21] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'candlestick', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    describe('boxplot', () => {
      // Five aligned numeric fields over a category axis: [min, Q1, median, Q3, max].
      const frame = toDataFrame({
        name: 'latency',
        fields: [
          { name: 'category', type: FieldType.string, values: ['Sales', 'Admin', 'IT'] },
          { name: 'min', type: FieldType.number, values: [1, 2, 3] },
          { name: 'q1', type: FieldType.number, values: [3, 4, 5] },
          { name: 'median', type: FieldType.number, values: [5, 6, 7] },
          { name: 'q3', type: FieldType.number, values: [7, 8, 9] },
          { name: 'max', type: FieldType.number, values: [9, 10, 11] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'boxplot', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });
  });

  // Binned heatmap: dataplane heatmap frames drawn as interval cells via the
  // custom series (see lib/echarts/converters/binnedHeatmap). One case per major
  // dataplane frame shape.
  describe('heatmap', () => {
    const times = [1783137094497, 1783140694497, 1783144294497, 1783147894497];

    // Matrix layout: a category x category grid via the native ECharts heatmap
    // series, fed by the wide/pivot shape (string rows + numeric columns).
    describe('matrix', () => {
      const frame = toDataFrame({
        fields: [
          { name: 'row', type: FieldType.string, values: ['a', 'b', 'c'] },
          { name: 'c1', type: FieldType.number, values: [1, 5, 9] },
          { name: 'c2', type: FieldType.number, values: [3, 7, 2] },
          { name: 'c3', type: FieldType.number, values: [8, 4, 6] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'heatmap', {
            heatmapLayout: 'matrix',
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    // heatmap-rows without `le` labels: each numeric field is an ordinal bucket
    // row labelled by field name (yLabelPlacement 'center').
    describe('heatmapRows', () => {
      const frame = toDataFrame({
        meta: { type: DataFrameType.HeatmapRows },
        fields: [
          { name: 'time', type: FieldType.time, values: times },
          { name: 'low', type: FieldType.number, values: [5, 6, 7, 8] },
          { name: 'mid', type: FieldType.number, values: [7, 8, 9, 10] },
          { name: 'high', type: FieldType.number, values: [9, 10, 11, 12] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'heatmap', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    // Prometheus native histogram: heatmap-rows keyed by `le` upper bounds,
    // including the open-ended `+Inf` top bucket (yLabelPlacement 'bound').
    describe('prometheus native histogram', () => {
      const frame = toDataFrame({
        meta: { type: DataFrameType.HeatmapRows },
        fields: [
          { name: 'time', type: FieldType.time, values: times },
          { name: 'b1', type: FieldType.number, values: [5, 6, 7, 8], labels: { le: '10' } },
          { name: 'b2', type: FieldType.number, values: [7, 8, 9, 10], labels: { le: '20' } },
          { name: 'b3', type: FieldType.number, values: [9, 10, 11, 12], labels: { le: '+Inf' } },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'heatmap', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    // heatmap-cells (dense): one row per cell with center x/y coordinates and a
    // value; cell bounds are inferred from the smallest gap between centers.
    describe('heatmapCells', () => {
      const frame = toDataFrame({
        meta: { type: DataFrameType.HeatmapCells },
        fields: [
          { name: 'x', type: FieldType.time, values: [times[0], times[0], times[1], times[1]] },
          { name: 'y', type: FieldType.number, values: [5, 15, 5, 15] },
          { name: 'Count', type: FieldType.number, values: [3, 7, 5, 9] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'heatmap', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    // Cartesian overlays: a heatmap cell layer plus line/bar series drawn on top.
    // Overlays render against a secondary y-axis (index 1); without it ECharts
    // errors during series init (e.g. "yAxis '0' not found" for a bar overlay).
    describe('overlay', () => {
      const heatmapFrame = toDataFrame({
        meta: { type: DataFrameType.HeatmapRows },
        fields: [
          { name: 'time', type: FieldType.time, values: times },
          { name: 'b1', type: FieldType.number, values: [5, 6, 7, 8], labels: { le: '10' } },
          { name: 'b2', type: FieldType.number, values: [7, 8, 9, 10], labels: { le: '20' } },
        ],
      });

      // Overlay frame: a numeric field overridden to a cartesian series type. Its
      // magnitude (100s) is far outside the bucket range, so it must ride the
      // secondary y-axis rather than being squashed onto the bucket scale.
      const overlayFrame = (overlaySeriesType: CartesianSingleValueSeriesType) =>
        toDataFrame({
          fields: [
            { name: 'time', type: FieldType.time, values: times },
            {
              name: 'metric',
              type: FieldType.number,
              values: [120, 340, 180, 260],
              config: { displayName: 'overlay-metric', custom: { seriesType: overlaySeriesType } },
            },
          ],
        });

      it.each(['line', 'bar', 'scatter'])('renders a %s overlay', async (overlaySeriesType) => {
        const { container } = render(
          getComponent([heatmapFrame, overlayFrame(overlaySeriesType as CartesianSingleValueSeriesType)], 'heatmap', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });

    // Sparse heatmap-cells: explicit xMin/xMax/yMin/yMax bounds per cell.
    describe('sparseHeatmaps', () => {
      const frame = toDataFrame({
        meta: { type: DataFrameType.HeatmapCells },
        fields: [
          { name: 'xMin', type: FieldType.time, values: [times[0], times[0], times[2], times[2]] },
          { name: 'xMax', type: FieldType.time, values: [times[1], times[1], times[3], times[3]] },
          { name: 'yMin', type: FieldType.number, values: [0, 10, 0, 10] },
          { name: 'yMax', type: FieldType.number, values: [10, 20, 10, 20] },
          { name: 'Count', type: FieldType.number, values: [3, 7, 5, 9] },
        ],
      });

      it('renders', async () => {
        const { container } = render(
          getComponent([frame], 'heatmap', {
            zLevel: { series: SERIES_ZLEVEL },
            animation: { enabled: false },
          })
        );

        const { defaultEvents, seriesEvents } = await getCanvasEvents(container);

        expect(removeCanvasTransforms(removeCanvasClear(seriesEvents))).toMatchCanvasSnapshot(defaultEvents, {
          width,
          height,
        });
      });
    });
  });
});
